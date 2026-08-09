import type { ComparisonRule, Monitor, MonitorMode } from '@web-monitor/shared';

interface MonitorRow {
  id: string;
  feed_id: string;
  name: string;
  url: string;
  monitor_mode: string;
  comparison_rule: string;
  enabled: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: MonitorRow): Monitor {
  return {
    id: row.id,
    feedId: row.feed_id,
    name: row.name,
    url: row.url,
    monitorMode: row.monitor_mode as MonitorMode,
    comparisonRule: row.comparison_rule as ComparisonRule,
    enabled: row.enabled === 1,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertMonitorInput {
  id: string;
  feedId: string;
  name: string;
  url: string;
  monitorMode: MonitorMode;
  comparisonRule: ComparisonRule;
  enabled: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export async function insertMonitor(db: D1Database, input: InsertMonitorInput): Promise<Monitor> {
  await db
    .prepare(
      `INSERT INTO monitors (
        id, feed_id, name, url, monitor_mode, comparison_rule, enabled, order_index,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.feedId,
      input.name,
      input.url,
      input.monitorMode,
      input.comparisonRule,
      input.enabled ? 1 : 0,
      input.orderIndex,
      input.createdAt,
      input.updatedAt,
    )
    .run();
  const created = await getMonitorById(db, input.id);
  if (!created) throw new Error('failed to read back inserted monitor');
  return created;
}

export async function getMonitorById(db: D1Database, id: string): Promise<Monitor | null> {
  const row = await db.prepare('SELECT * FROM monitors WHERE id = ?').bind(id).first<MonitorRow>();
  return row ? mapRow(row) : null;
}

export async function listMonitors(db: D1Database): Promise<Monitor[]> {
  const { results } = await db
    .prepare('SELECT * FROM monitors ORDER BY order_index ASC, created_at ASC')
    .all<MonitorRow>();
  return results.map(mapRow);
}

export async function listEnabledMonitors(db: D1Database): Promise<Monitor[]> {
  const { results } = await db
    .prepare('SELECT * FROM monitors WHERE enabled = 1 ORDER BY order_index ASC, created_at ASC')
    .all<MonitorRow>();
  return results.map(mapRow);
}

export interface UpdateMonitorInput {
  feedId?: string | undefined;
  name?: string | undefined;
  url?: string | undefined;
  monitorMode?: MonitorMode | undefined;
  comparisonRule?: ComparisonRule | undefined;
  enabled?: boolean | undefined;
  orderIndex?: number | undefined;
}

export async function updateMonitor(
  db: D1Database,
  id: string,
  patch: UpdateMonitorInput,
  updatedAt: string,
): Promise<Monitor | null> {
  const existing = await getMonitorById(db, id);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  await db
    .prepare(
      `UPDATE monitors
       SET feed_id = ?, name = ?, url = ?, monitor_mode = ?, comparison_rule = ?, enabled = ?, order_index = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      merged.feedId,
      merged.name,
      merged.url,
      merged.monitorMode,
      merged.comparisonRule,
      merged.enabled ? 1 : 0,
      merged.orderIndex,
      updatedAt,
      id,
    )
    .run();
  return getMonitorById(db, id);
}

export async function setMonitorEnabled(
  db: D1Database,
  id: string,
  enabled: boolean,
  updatedAt: string,
): Promise<Monitor | null> {
  await db
    .prepare('UPDATE monitors SET enabled = ?, updated_at = ? WHERE id = ?')
    .bind(enabled ? 1 : 0, updatedAt, id)
    .run();
  return getMonitorById(db, id);
}

export async function getMonitorNamesByIds(
  db: D1Database,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return map;
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT id, name, url FROM monitors WHERE id IN (${placeholders})`)
    .bind(...uniqueIds)
    .all<{ id: string; name: string; url: string }>();
  for (const row of results) map.set(row.id, row.name);
  return map;
}

export async function countMonitorsForFeed(db: D1Database, feedId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) as count FROM monitors WHERE feed_id = ?')
    .bind(feedId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function deleteMonitor(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM selections WHERE monitor_id = ?').bind(id).run();
  await db.prepare('DELETE FROM monitor_state WHERE monitor_id = ?').bind(id).run();
  await db.prepare('DELETE FROM checks WHERE monitor_id = ?').bind(id).run();
  await db.prepare('DELETE FROM changes WHERE monitor_id = ?').bind(id).run();
  await db.prepare('DELETE FROM monitors WHERE id = ?').bind(id).run();
}
