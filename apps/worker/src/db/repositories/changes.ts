import type { Change, ChangeType, ExtractedSelectionValue } from '@web-monitor/shared';

interface ChangeRow {
  id: string;
  feed_id: string;
  monitor_id: string | null;
  detected_at: string;
  change_type: string;
  old_value_json: string | null;
  new_value_json: string | null;
  changed_selection_ids_json: string;
  change_fingerprint: string;
  guid: string;
  source_url: string | null;
  published: number;
}

function mapRow(row: ChangeRow): Change {
  return {
    id: row.id,
    feedId: row.feed_id,
    monitorId: row.monitor_id,
    detectedAt: row.detected_at,
    changeType: row.change_type as ChangeType,
    oldValue: row.old_value_json
      ? (JSON.parse(row.old_value_json) as ExtractedSelectionValue[])
      : null,
    newValue: row.new_value_json
      ? (JSON.parse(row.new_value_json) as ExtractedSelectionValue[])
      : null,
    changedSelectionIds: JSON.parse(row.changed_selection_ids_json) as string[],
    changeFingerprint: row.change_fingerprint,
    guid: row.guid,
    sourceUrl: row.source_url,
    published: row.published === 1,
  };
}

export interface InsertChangeInput {
  id: string;
  feedId: string;
  monitorId: string | null;
  detectedAt: string;
  changeType: ChangeType;
  oldValue: ExtractedSelectionValue[] | null;
  newValue: ExtractedSelectionValue[] | null;
  changedSelectionIds: string[];
  changeFingerprint: string;
  guid: string;
  sourceUrl: string | null;
}

export async function insertChange(db: D1Database, input: InsertChangeInput): Promise<Change> {
  await db
    .prepare(
      `INSERT INTO changes (
        id, feed_id, monitor_id, detected_at, change_type, old_value_json, new_value_json,
        changed_selection_ids_json, change_fingerprint, guid, source_url, published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      input.id,
      input.feedId,
      input.monitorId,
      input.detectedAt,
      input.changeType,
      input.oldValue ? JSON.stringify(input.oldValue) : null,
      input.newValue ? JSON.stringify(input.newValue) : null,
      JSON.stringify(input.changedSelectionIds),
      input.changeFingerprint,
      input.guid,
      input.sourceUrl,
    )
    .run();
  const created = await getChangeById(db, input.id);
  if (!created) throw new Error('failed to read back inserted change');
  return created;
}

export async function getChangeById(db: D1Database, id: string): Promise<Change | null> {
  const row = await db.prepare('SELECT * FROM changes WHERE id = ?').bind(id).first<ChangeRow>();
  return row ? mapRow(row) : null;
}

export async function findChangeByFingerprint(
  db: D1Database,
  monitorId: string,
  fingerprint: string,
): Promise<Change | null> {
  const row = await db
    .prepare('SELECT * FROM changes WHERE monitor_id = ? AND change_fingerprint = ?')
    .bind(monitorId, fingerprint)
    .first<ChangeRow>();
  return row ? mapRow(row) : null;
}

export async function listChangesByFeed(
  db: D1Database,
  feedId: string,
  limit: number,
): Promise<Change[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM changes WHERE feed_id = ? AND published = 1 ORDER BY detected_at DESC LIMIT ?',
    )
    .bind(feedId, limit)
    .all<ChangeRow>();
  return results.map(mapRow);
}

// Counts published changes grouped by feed, for showing how many items each
// feed's RSS currently contains without a query per Monitor row.
export async function countPublishedChangesGroupedByFeed(
  db: D1Database,
): Promise<Map<string, number>> {
  const { results } = await db
    .prepare('SELECT feed_id, COUNT(*) as count FROM changes WHERE published = 1 GROUP BY feed_id')
    .all<{ feed_id: string; count: number }>();
  return new Map(results.map((row) => [row.feed_id, row.count]));
}

export async function listChangesByMonitor(
  db: D1Database,
  monitorId: string,
  limit: number,
): Promise<Change[]> {
  const { results } = await db
    .prepare('SELECT * FROM changes WHERE monitor_id = ? ORDER BY detected_at DESC LIMIT ?')
    .bind(monitorId, limit)
    .all<ChangeRow>();
  return results.map(mapRow);
}

/**
 * Per-monitor fetch-failure alert state, derived from the most recent
 * SYSTEM_ALERT/SYSTEM_RECOVERY change row for that monitor rather than a
 * dedicated column: an ALERT with no later RECOVERY means the alert is
 * still active.
 */
export async function getMonitorAlertState(
  db: D1Database,
  monitorId: string,
): Promise<'active' | 'none'> {
  const row = await db
    .prepare(
      `SELECT change_type FROM changes
       WHERE monitor_id = ? AND change_type IN ('SYSTEM_ALERT', 'SYSTEM_RECOVERY')
       ORDER BY detected_at DESC LIMIT 1`,
    )
    .bind(monitorId)
    .first<{ change_type: string }>();
  return row?.change_type === 'SYSTEM_ALERT' ? 'active' : 'none';
}

export async function latestFeedChangeTimestamp(
  db: D1Database,
  feedId: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT detected_at FROM changes WHERE feed_id = ? ORDER BY detected_at DESC LIMIT 1')
    .bind(feedId)
    .first<{ detected_at: string }>();
  return row?.detected_at ?? null;
}
