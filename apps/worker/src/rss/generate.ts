import type { Change, ChangeType, Feed } from '@web-monitor/shared';
import { listChangesByFeed } from '../db/repositories/changes.js';
import { getMonitorNamesByIds } from '../db/repositories/monitors.js';
import { escapeXml, toRfc822 } from './xml.js';

export const ITEM_LIMIT = 20;

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  CHANGED: '変更',
  ADDED: '追加',
  UPDATED: '更新',
  REMOVED: '削除',
  SYSTEM_ALERT: '稼働警告',
  SYSTEM_RECOVERY: '稼働回復',
};

function buildTitle(change: Change, monitorName: string | undefined): string {
  const label = CHANGE_TYPE_LABELS[change.changeType];
  if (change.changeType === 'SYSTEM_ALERT' || change.changeType === 'SYSTEM_RECOVERY') {
    return label;
  }
  return `${monitorName ?? '監視対象'} - ${label}`;
}

function buildDescription(change: Change): string {
  if (change.changeType === 'SYSTEM_ALERT' || change.changeType === 'SYSTEM_RECOVERY') {
    const detail = change.newValue?.[0]?.displayValue;
    return typeof detail === 'string' ? detail : '';
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
    const oldDisplay = formatDisplay(oldValue?.displayValue);
    const newDisplay = formatDisplay(newValue?.displayValue);
    return ids.length > 1
      ? `${label}: ${oldDisplay} → ${newDisplay}`
      : `${oldDisplay} → ${newDisplay}`;
  });
  return lines.join('\n');
}

function formatDisplay(value: string | string[] | undefined): string {
  if (value === undefined) return '(なし)';
  return Array.isArray(value) ? value.join(', ') : value;
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

  const items = changes
    .map((change) => {
      const title = buildTitle(
        change,
        change.monitorId ? monitorNames.get(change.monitorId) : undefined,
      );
      const description = buildDescription(change);
      const link = change.sourceUrl ?? channelLink;
      return [
        '    <item>',
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(change.guid)}</guid>`,
        `      <pubDate>${toRfc822(change.detectedAt)}</pubDate>`,
        `      <description>${escapeXml(description)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeXml(feed.name)}</title>`,
    `    <link>${escapeXml(channelLink)}</link>`,
    `    <description>${escapeXml(feed.name)} の監視結果</description>`,
    `    <lastBuildDate>${toRfc822(lastBuildDate)}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
  ]
    .filter((line) => line.length > 0)
    .join('\n');

  return { xml, lastBuildDate };
}
