import { createSystemEvent } from '../changes/system-event.js';
import {
  getSystemState,
  setAlertStatus,
  setWatchdogChecked,
} from '../db/repositories/system-state.js';

/**
 * Independent of GitHub Actions: reads only system_state timestamps and
 * never contacts monitored sites. Called from the Worker cron trigger and,
 * for faster recovery, right after a successful runner heartbeat.
 */
export async function evaluateHeartbeat(
  db: D1Database,
  origin: string,
  now: string,
): Promise<void> {
  const state = await getSystemState(db);
  const staleMs = state.lastRunnerSuccessAt
    ? new Date(now).getTime() - new Date(state.lastRunnerSuccessAt).getTime()
    : Number.POSITIVE_INFINITY;
  const isStale = staleMs > state.heartbeatThresholdSec * 1000;

  if (isStale && state.alertStatus === 'healthy') {
    const changeId = await createSystemEvent(db, {
      changeType: 'SYSTEM_ALERT',
      monitorId: null,
      sourceUrl: null,
      key: 'heartbeat',
      now,
      origin,
      description: `No successful Runner run in over ${state.heartbeatThresholdSec} seconds. Check whether the GitHub Actions schedule has stopped.`,
    });
    await setAlertStatus(db, 'stale', changeId, now);
  } else if (!isStale && state.alertStatus === 'stale') {
    await createSystemEvent(db, {
      changeType: 'SYSTEM_RECOVERY',
      monitorId: null,
      sourceUrl: null,
      key: 'heartbeat',
      now,
      origin,
      description: 'Runner has recovered and a heartbeat was received successfully.',
    });
    // No alert is active once healthy, so this must be cleared rather than
    // pointed at the recovery event's own id.
    await setAlertStatus(db, 'healthy', null, now);
  }
}

export async function runWatchdogCron(db: D1Database, origin: string, now: string): Promise<void> {
  await evaluateHeartbeat(db, origin, now);
  await setWatchdogChecked(db, now);
}
