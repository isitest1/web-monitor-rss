import {
  diffArrayValues,
  diffScalarText,
  DEFAULT_CHECK_INTERVAL_SEC,
  type Change,
  type ChangeType,
  type Feed,
} from '@web-monitor/shared';
import { listChangesByFeed } from '../db/repositories/changes.js';
import {
  getMinCheckIntervalSecForFeed,
  getMonitorNamesByIds,
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

// A repeating-list item's date is usually the leading chunk, originally
// set apart from the title by its own tag in the source markup — already
// flattened away by extraction, so this matches a leading date directly in
// the flattened display text instead (works whether or not a separating
// space survived the flattening).
const LEADING_DATE_PATTERN =
  /^\s*(\d{4}[-/.年]\s?\d{1,2}[-/.月]\s?\d{1,2}日?(?:\([月火水木金土日]\))?)\s*[:：\-–—]?\s*/;

/**
 * For a list-mode Selection with newly added items, splits the first added
 * item's text into "date title" for the RSS title, e.g. a news/blog list
 * gaining an entry surfaces its own date and headline instead of a generic
 * "Changed". Returns null (falling back to the plain Monitor-name title)
 * when nothing starts with a recognizable date.
 */
function firstAddedListItemTitle(change: Change): string | null {
  for (const newValue of change.newValue ?? []) {
    if (!Array.isArray(newValue.displayValue)) continue;
    const oldValue = change.oldValue?.find((v) => v.selectionId === newValue.selectionId);
    const { added } = diffArrayValues(
      Array.isArray(oldValue?.displayValue) ? oldValue.displayValue : undefined,
      newValue.displayValue,
    );
    const first = added[0];
    if (!first) continue;
    const match = LEADING_DATE_PATTERN.exec(first);
    if (!match) continue;
    const date = match[1];
    const title = first.slice(match[0].length).trim();
    if (!title) continue;
    return `${date} ${title}`;
  }
  return null;
}

function buildTitle(change: Change, monitorName: string | undefined): string {
  const label = CHANGE_TYPE_LABELS[change.changeType];
  if (change.changeType === 'SYSTEM_ALERT' || change.changeType === 'SYSTEM_RECOVERY') {
    return label;
  }
  const name = monitorName ?? 'Monitor';
  const listItemTitle = firstAddedListItemTitle(change);
  return listItemTitle ? `${name}: ${listItemTitle}` : `${name} - ${label}`;
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

/** Returns HTML already safe to drop directly into <description> — text is escaped internally, so callers must not escape it again. */
function buildDescription(change: Change, link: string): string {
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
    const line = formatChangeLine(
      label,
      oldValue?.displayValue,
      newValue?.displayValue,
      ids.length > 1,
    );
    return escapeXmlMultiline(line) + imageTags(newValue?.images, link);
  });
  return lines.join('<br/>');
}

function formatDisplay(value: string | string[] | undefined): string {
  if (value === undefined) return '(none)';
  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * Renders a scalar (single-value) Selection's change as the edited portion
 * in context, instead of the whole before/after text — trims the shared
 * prefix/suffix via diffScalarText so a one-sentence edit in a long
 * paragraph doesn't force the reader to spot the difference themselves.
 */
function formatScalarDiff(oldValue: string, newValue: string): string {
  const diff = diffScalarText(oldValue, newValue);
  if (!diff.changed) return newValue;
  const core =
    diff.removed && diff.added
      ? `${diff.removed} → ${diff.added}`
      : diff.added
        ? `Added: ${diff.added}`
        : `Removed: ${diff.removed}`;
  return `${diff.contextBefore}[${core}]${diff.contextAfter}`;
}

/**
 * For a list-mode (array-valued) Selection, shows which entries were added/
 * removed instead of the whole before/after list; for a scalar Selection,
 * shows just the edited portion in context (§ Feature: 差分表示改善) —
 * both avoid dumping the whole before/after value for a change that only
 * touched a small part of it.
 */
function formatChangeLine(
  label: string,
  oldValue: string | string[] | undefined,
  newValue: string | string[] | undefined,
  showLabel: boolean,
): string {
  if (Array.isArray(newValue)) {
    const { added, removed } = diffArrayValues(
      Array.isArray(oldValue) ? oldValue : undefined,
      newValue,
    );
    const parts: string[] = [];
    if (added.length > 0) parts.push(`Added: ${added.join('\n')}`);
    if (removed.length > 0) parts.push(`Removed: ${removed.join('\n')}`);
    const diffText = parts.length > 0 ? parts.join('\n') : '(order changed)';
    return showLabel ? `${label}: ${diffText}` : diffText;
  }
  const diffText =
    typeof oldValue === 'string' && typeof newValue === 'string'
      ? formatScalarDiff(oldValue, newValue)
      : `${formatDisplay(oldValue)} → ${formatDisplay(newValue)}`;
  return showLabel ? `${label}: ${diffText}` : diffText;
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
  const monitorNames = await getMonitorNamesByIds(db, monitorIds);

  const lastBuildDate = changes[0]?.detectedAt ?? feed.updatedAt;

  const intervalSec =
    feed.kind === 'system'
      ? SYSTEM_FEED_INTERVAL_SEC
      : ((await getMinCheckIntervalSecForFeed(db, feed.id)) ?? DEFAULT_CHECK_INTERVAL_SEC);
  const ttlMinutes = Math.max(1, Math.round(intervalSec / 60));
  const updatePeriod = updatePeriodFor(intervalSec);

  const items = changes
    .map((change) => {
      const title = buildTitle(
        change,
        change.monitorId ? monitorNames.get(change.monitorId) : undefined,
      );
      const link = change.sourceUrl ?? channelLink;
      const description = buildDescription(change, link);
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
