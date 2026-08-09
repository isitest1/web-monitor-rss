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
export async function evaluateHeartbeat(db: D1Database, now: string): Promise<void> {
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
      description: `Runnerの最終正常実行から${state.heartbeatThresholdSec}秒を超えて更新がありません。GitHub Actionsのscheduleが停止していないか確認してください。`,
    });
    await setAlertStatus(db, 'stale', changeId, now);
  } else if (!isStale && state.alertStatus === 'stale') {
    const changeId = await createSystemEvent(db, {
      changeType: 'SYSTEM_RECOVERY',
      monitorId: null,
      sourceUrl: null,
      key: 'heartbeat',
      now,
      description: 'Runnerの実行が復旧し、正常なハートビートを受信しました。',
    });
    await setAlertStatus(db, 'healthy', changeId, now);
  }
}

export async function runWatchdogCron(db: D1Database, now: string): Promise<void> {
  await evaluateHeartbeat(db, now);
  await setWatchdogChecked(db, now);
}
