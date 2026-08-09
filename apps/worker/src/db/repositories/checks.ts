import type { Check, StatusCode } from '@web-monitor/shared';

interface CheckRow {
  id: string;
  monitor_id: string;
  run_id: string;
  started_at: string;
  finished_at: string;
  status: string;
  duration_ms: number;
  http_status: number | null;
  result_hash: string | null;
  error_code: string | null;
  error_message: string | null;
}

function mapRow(row: CheckRow): Check {
  return {
    id: row.id,
    monitorId: row.monitor_id,
    runId: row.run_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as StatusCode,
    durationMs: row.duration_ms,
    httpStatus: row.http_status,
    resultHash: row.result_hash,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

export interface InsertCheckInput {
  id: string;
  monitorId: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: StatusCode;
  durationMs: number;
  httpStatus: number | null;
  resultHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export async function insertCheck(db: D1Database, input: InsertCheckInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO checks (
        id, monitor_id, run_id, started_at, finished_at, status, duration_ms, http_status,
        result_hash, error_code, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.monitorId,
      input.runId,
      input.startedAt,
      input.finishedAt,
      input.status,
      input.durationMs,
      input.httpStatus,
      input.resultHash,
      input.errorCode,
      input.errorMessage,
    )
    .run();
}

export async function listChecksByMonitor(
  db: D1Database,
  monitorId: string,
  limit: number,
): Promise<Check[]> {
  const { results } = await db
    .prepare('SELECT * FROM checks WHERE monitor_id = ? ORDER BY started_at DESC LIMIT ?')
    .bind(monitorId, limit)
    .all<CheckRow>();
  return results.map(mapRow);
}

const RETENTION_DAYS = 90;

export async function purgeOldChecks(db: D1Database, now: string): Promise<void> {
  const cutoff = new Date(
    new Date(now).getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await db.prepare('DELETE FROM checks WHERE started_at < ?').bind(cutoff).run();
}
