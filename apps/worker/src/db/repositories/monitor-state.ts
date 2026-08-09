import type { ExtractedSelectionValue, MonitorState, MonitorStatus } from '@web-monitor/shared';

interface MonitorStateRow {
  monitor_id: string;
  status: string;
  current_value_json: string | null;
  current_hash: string | null;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_changed_at: string | null;
  consecutive_failures: number;
  last_error_code: string | null;
  last_error_message: string | null;
  updated_at: string;
}

function mapRow(row: MonitorStateRow): MonitorState {
  return {
    monitorId: row.monitor_id,
    status: row.status as MonitorStatus,
    currentValue: row.current_value_json
      ? (JSON.parse(row.current_value_json) as ExtractedSelectionValue[])
      : null,
    currentHash: row.current_hash,
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastChangedAt: row.last_changed_at,
    consecutiveFailures: row.consecutive_failures,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    updatedAt: row.updated_at,
  };
}

export async function getMonitorState(
  db: D1Database,
  monitorId: string,
): Promise<MonitorState | null> {
  const row = await db
    .prepare('SELECT * FROM monitor_state WHERE monitor_id = ?')
    .bind(monitorId)
    .first<MonitorStateRow>();
  return row ? mapRow(row) : null;
}

export async function listMonitorStates(db: D1Database): Promise<Map<string, MonitorState>> {
  const { results } = await db.prepare('SELECT * FROM monitor_state').all<MonitorStateRow>();
  const map = new Map<string, MonitorState>();
  for (const row of results) map.set(row.monitor_id, mapRow(row));
  return map;
}

export async function ensureMonitorState(
  db: D1Database,
  monitorId: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO monitor_state (monitor_id, status, consecutive_failures, updated_at)
       VALUES (?, 'UNCHECKED', 0, ?)
       ON CONFLICT (monitor_id) DO NOTHING`,
    )
    .bind(monitorId, now)
    .run();
}

export interface MonitorStateUpsert {
  status: MonitorStatus;
  currentValue?: ExtractedSelectionValue[] | null;
  currentHash?: string | null;
  lastCheckedAt: string;
  lastSuccessAt?: string | null;
  lastChangedAt?: string | null;
  consecutiveFailures: number;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}

export async function upsertMonitorState(
  db: D1Database,
  monitorId: string,
  patch: MonitorStateUpsert,
  updatedAt: string,
): Promise<void> {
  const existing = await getMonitorState(db, monitorId);
  const merged: MonitorStateUpsert & {
    currentValue: ExtractedSelectionValue[] | null;
    currentHash: string | null;
  } = {
    ...patch,
    currentValue:
      patch.currentValue !== undefined ? patch.currentValue : (existing?.currentValue ?? null),
    currentHash:
      patch.currentHash !== undefined ? patch.currentHash : (existing?.currentHash ?? null),
    lastSuccessAt:
      patch.lastSuccessAt !== undefined ? patch.lastSuccessAt : (existing?.lastSuccessAt ?? null),
    lastChangedAt:
      patch.lastChangedAt !== undefined ? patch.lastChangedAt : (existing?.lastChangedAt ?? null),
    lastErrorCode:
      patch.lastErrorCode !== undefined ? patch.lastErrorCode : (existing?.lastErrorCode ?? null),
    lastErrorMessage:
      patch.lastErrorMessage !== undefined
        ? patch.lastErrorMessage
        : (existing?.lastErrorMessage ?? null),
  };
  await db
    .prepare(
      `INSERT INTO monitor_state (
        monitor_id, status, current_value_json, current_hash, last_checked_at, last_success_at,
        last_changed_at, consecutive_failures, last_error_code, last_error_message, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (monitor_id) DO UPDATE SET
        status = excluded.status,
        current_value_json = excluded.current_value_json,
        current_hash = excluded.current_hash,
        last_checked_at = excluded.last_checked_at,
        last_success_at = excluded.last_success_at,
        last_changed_at = excluded.last_changed_at,
        consecutive_failures = excluded.consecutive_failures,
        last_error_code = excluded.last_error_code,
        last_error_message = excluded.last_error_message,
        updated_at = excluded.updated_at`,
    )
    .bind(
      monitorId,
      merged.status,
      merged.currentValue ? JSON.stringify(merged.currentValue) : null,
      merged.currentHash,
      merged.lastCheckedAt,
      merged.lastSuccessAt,
      merged.lastChangedAt,
      merged.consecutiveFailures,
      merged.lastErrorCode,
      merged.lastErrorMessage,
      updatedAt,
    )
    .run();
}
