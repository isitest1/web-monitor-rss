import type { AlertStatus, SystemState } from '@web-monitor/shared';

interface SystemStateRow {
  id: number;
  last_runner_run_at: string | null;
  last_runner_success_at: string | null;
  last_runner_run_id: string | null;
  heartbeat_threshold_sec: number;
  alert_status: string;
  active_alert_change_id: string | null;
  last_watchdog_checked_at: string | null;
  updated_at: string;
}

function mapRow(row: SystemStateRow): SystemState {
  return {
    id: row.id,
    lastRunnerRunAt: row.last_runner_run_at,
    lastRunnerSuccessAt: row.last_runner_success_at,
    lastRunnerRunId: row.last_runner_run_id,
    heartbeatThresholdSec: row.heartbeat_threshold_sec,
    alertStatus: row.alert_status as AlertStatus,
    activeAlertChangeId: row.active_alert_change_id,
    lastWatchdogCheckedAt: row.last_watchdog_checked_at,
    updatedAt: row.updated_at,
  };
}

export async function getSystemState(db: D1Database): Promise<SystemState> {
  const row = await db.prepare('SELECT * FROM system_state WHERE id = 1').first<SystemStateRow>();
  if (!row) throw new Error('system_state row is missing; migrations must seed id=1');
  return mapRow(row);
}

export async function recordRunnerStart(
  db: D1Database,
  runId: string,
  timestamp: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE system_state SET last_runner_run_at = ?, last_runner_run_id = ?, updated_at = ? WHERE id = 1`,
    )
    .bind(timestamp, runId, timestamp)
    .run();
}

export async function recordRunnerSuccess(db: D1Database, timestamp: string): Promise<void> {
  await db
    .prepare(`UPDATE system_state SET last_runner_success_at = ?, updated_at = ? WHERE id = 1`)
    .bind(timestamp, timestamp)
    .run();
}

export async function setWatchdogChecked(db: D1Database, timestamp: string): Promise<void> {
  await db
    .prepare('UPDATE system_state SET last_watchdog_checked_at = ?, updated_at = ? WHERE id = 1')
    .bind(timestamp, timestamp)
    .run();
}

export async function setAlertStatus(
  db: D1Database,
  status: AlertStatus,
  activeAlertChangeId: string | null,
  timestamp: string,
): Promise<void> {
  await db
    .prepare(
      'UPDATE system_state SET alert_status = ?, active_alert_change_id = ?, updated_at = ? WHERE id = 1',
    )
    .bind(status, activeAlertChangeId, timestamp)
    .run();
}

export async function setHeartbeatThreshold(
  db: D1Database,
  seconds: number,
  timestamp: string,
): Promise<void> {
  await db
    .prepare('UPDATE system_state SET heartbeat_threshold_sec = ?, updated_at = ? WHERE id = 1')
    .bind(seconds, timestamp)
    .run();
}
