import {
  diffArrayValues,
  formatChangeLineHtml,
  DEFAULT_CHECK_INTERVAL_SEC,
  type Change,
  type ChangeDisplayMode,
  type ChangeType,
  type Feed,
} from '@web-monitor/shared';
import { listChangesByFeed } from '../db/repositories/changes.js';
import {
  getMinCheckIntervalSecForFeed,
  getMonitorRssInfoByIds,
  type MonitorRssInfo,
} from '../db/repositories/monitors.js';
import { escapeXml, escapeXmlMultiline, toRfc822, wrapCData } from './xml.js';

// The Worker cron watchdog (§8.6) runs hourly regardless of any Monitor's
// own interval, so that is the honest cadence to advertise for a system
// Feed (heartbeat alerts/recoveries), independent of content Monitors.
const SYSTEM_FEED_INTERVAL_SEC = 3600;

type SyUpdatePeriod = 'hourly' | 'daily' | 'weekly';

// checkIntervalSecSchema caps at 604800 (7 days), so "weekly" is the
// coarsest period this can ever need to express.
function updatePeriodFor(intervalSec: number): SyUpdatePeriod {
  if (intervalSec <= 3600) return 'hourly';
  if (intervalSec <= 86400) return 'daily';
  return 'weekly';
}

export const ITEM_LIMIT = 20;

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  CHANGED: 'Changed',
  ADDED: 'Added',
  UPDATED: 'Updated',
  REMOVED: 'Removed',
  SYSTEM_ALERT: 'System Alert',
  SYSTEM_RECOVERY: 'System Recovery',
};

/**
 * The item title is just the monitored page's title (the Monitor's name,
 * which defaults to document.title when the Monitor is created) — never
 * content derived, since a headline or diff excerpt can run long enough to
 * make some RSS readers choke. System events aren't tied to a page, so they
 * keep their own short label instead.
 */
function buildTitle(change: Change, monitorName: string | undefined): string {
  if (change.changeType === 'SYSTEM_ALERT' || change.changeType === 'SYSTEM_RECOVERY') {
    return CHANGE_TYPE_LABELS[change.changeType];
  }
  return monitorName ?? 'Monitor';
}

/**
 * <img> tags (each linked back to the source page) for a Selection's
 * captured images, display-only — never derived from or affecting the
 * comparison value. Returns already-HTML-safe markup (values are escaped
 * here), meant to be appended to an already-escaped text line.
 */
function imageTags(images: string[] | undefined, link: string): string {
  if (!images || images.length === 0) return '';
  return images
    .map(
      (url) =>
        `<br/><a href="${escapeXml(link)}"><img src="${escapeXml(url)}" alt="" style="max-width:100%;height:auto;" /></a>`,
    )
    .join('');
}

/**
 * For a list-mode Selection, collects the captured images (§7.4) belonging
 * to newly added entries — the 'text'-mode equivalent already has a single
 * flat `images` list, but a list-mode Selection's images are captured per
 * item (`itemImages`), so this pairs each added display string back to its
 * item's images by position, skipping an index already claimed by an
 * earlier match so duplicate display strings don't all resolve to the same
 * item.
 */
function addedListItemImages(
  oldDisplay: string[] | undefined,
  newDisplay: string[],
  itemImages: string[][] | undefined,
): string[] {
  if (!itemImages) return [];
  const { added } = diffArrayValues(oldDisplay, newDisplay);
  const usedIndices = new Set<number>();
  const images: string[] = [];
  for (const item of added) {
    const idx = newDisplay.findIndex((v, i) => v === item && !usedIndices.has(i));
    if (idx === -1) continue;
    usedIndices.add(idx);
    for (const url of itemImages[idx] ?? []) {
      if (!images.includes(url)) images.push(url);
    }
  }
  return images;
}

/** Returns HTML already safe to drop directly into <description> — text is escaped internally, so callers must not escape it again. */
function buildDescription(change: Change, link: string, mode: ChangeDisplayMode): string {
  if (change.changeType === 'SYSTEM_ALERT' || change.changeType === 'SYSTEM_RECOVERY') {
    const detail = change.newValue?.[0]?.displayValue;
    return typeof detail === 'string' ? escapeXmlMultiline(detail) : '';
  }
  const oldById = new Map((change.oldValue ?? []).map((v) => [v.selectionId, v]));
  const newById = new Map((change.newValue ?? []).map((v) => [v.selectionId, v]));
  const ids =
    change.changedSelectionIds.length > 0 ? change.changedSelectionIds : [...newById.keys()];
  // A Selection's label only disambiguates when more than one changed in
  // the same event; for the common single-Selection Monitor it is just
  // noise (e.g. an unrenamed default "選択1"), so it is omitted then.
  const lines = ids.map((id) => {
    const oldValue = oldById.get(id);
    const newValue = newById.get(id);
    const label = newValue?.label ?? oldValue?.label ?? id;
    const line = formatChangeLineHtml(
      label,
      oldValue?.displayValue,
      newValue?.displayValue,
      ids.length > 1,
      mode,
      escapeXmlMultiline,
    );
    const images = Array.isArray(newValue?.displayValue)
      ? addedListItemImages(
          Array.isArray(oldValue?.displayValue) ? oldValue.displayValue : undefined,
          newValue.displayValue,
          newValue.itemImages,
        )
      : newValue?.images;
    return line + imageTags(images, link);
  });
  return lines.join('<br/>');
}

export interface RssGenerationResult {
  xml: string;
  lastBuildDate: string;
}

export async function generateFeedRss(
  db: D1Database,
  feed: Feed,
  channelLink: string,
): Promise<RssGenerationResult> {
  const changes = await listChangesByFeed(db, feed.id, ITEM_LIMIT);
  const monitorIds = changes.map((c) => c.monitorId).filter((id): id is string => id !== null);
  const monitorInfo = await getMonitorRssInfoByIds(db, monitorIds);

  const lastBuildDate = changes[0]?.detectedAt ?? feed.updatedAt;

  const intervalSec =
    feed.kind === 'system'
      ? SYSTEM_FEED_INTERVAL_SEC
      : ((await getMinCheckIntervalSecForFeed(db, feed.id)) ?? DEFAULT_CHECK_INTERVAL_SEC);
  const ttlMinutes = Math.max(1, Math.round(intervalSec / 60));
  const updatePeriod = updatePeriodFor(intervalSec);

  const items = changes
    .map((change) => {
      const info: MonitorRssInfo | undefined = change.monitorId
        ? monitorInfo.get(change.monitorId)
        : undefined;
      const title = buildTitle(change, info?.name);
      const link = change.sourceUrl ?? channelLink;
      const description = buildDescription(change, link, info?.changeDisplayMode ?? 'both');
      const descriptionCData = wrapCData(description);
      return [
        '    <item>',
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(change.guid)}</guid>`,
        `      <pubDate>${toRfc822(change.detectedAt)}</pubDate>`,
        `      <description>${descriptionCData}</description>`,
        `      <content:encoded>${descriptionCData}</content:encoded>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:sy="http://purl.org/rss/1.0/modules/syndication/" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    `    <title>${escapeXml(feed.name)}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>Monitoring results for ${escapeXml(feed.name)}</description>`,
    `    <lastBuildDate>${toRfc822(lastBuildDate)}</lastBuildDate>`,
    `    <ttl>${ttlMinutes}</ttl>`,
    `    <sy:updatePeriod>${updatePeriod}</sy:updatePeriod>`,
    '    <sy:updateFrequency>1</sy:updateFrequency>',
    items,
    '  </channel>',
    '</rss>',
  ]
    .filter((line) => line.length > 0)
    .join('\n');

  return { xml, lastBuildDate };
}
