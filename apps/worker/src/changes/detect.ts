import type {
  ExtractedSelectionValue,
  Monitor,
  RunnerResultRequest,
  RunnerResultResponse,
} from '@web-monitor/shared';
import { generateId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { insertCheck } from '../db/repositories/checks.js';
import {
  getMonitorState,
  upsertMonitorState,
  type MonitorStateUpsert,
} from '../db/repositories/monitor-state.js';
import {
  findChangeByFingerprint,
  getMonitorAlertState,
  insertChange,
} from '../db/repositories/changes.js';
import { computeChangeFingerprint, computeResultHash } from './fingerprint.js';
import { createSystemEvent } from './system-event.js';

const FAILURE_ALERT_THRESHOLD = 2;

export interface ProcessRunnerResultParams {
  db: D1Database;
  monitor: Monitor;
  request: RunnerResultRequest;
}

export async function processRunnerResult(
  params: ProcessRunnerResultParams,
): Promise<RunnerResultResponse> {
  const { db, monitor, request } = params;
  const now = nowIso();

  await insertCheck(db, {
    id: generateId(),
    monitorId: monitor.id,
    runId: request.runId,
    startedAt: request.startedAt,
    finishedAt: request.finishedAt,
    status: request.status,
    durationMs: request.durationMs,
    httpStatus: request.httpStatus,
    resultHash: request.status === 'SUCCESS' ? await computeResultHash(request.values) : null,
    errorCode: request.errorCode,
    errorMessage: request.errorMessage,
  });

  const priorState = await getMonitorState(db, monitor.id);

  if (request.status !== 'SUCCESS') {
    return handleFailure(db, monitor, priorState?.consecutiveFailures ?? 0, request, now);
  }

  return handleSuccess(db, monitor, priorState, request, now);
}

async function handleFailure(
  db: D1Database,
  monitor: Monitor,
  priorFailures: number,
  request: RunnerResultRequest,
  now: string,
): Promise<RunnerResultResponse> {
  const consecutiveFailures = priorFailures + 1;
  const patch: MonitorStateUpsert = {
    // Callers only reach handleFailure when request.status !== 'SUCCESS'.
    status: request.status as MonitorStateUpsert['status'],
    lastCheckedAt: now,
    consecutiveFailures,
    lastErrorCode: request.errorCode,
    lastErrorMessage: request.errorMessage,
  };
  await upsertMonitorState(db, monitor.id, patch, now);

  if (consecutiveFailures === FAILURE_ALERT_THRESHOLD) {
    const alertState = await getMonitorAlertState(db, monitor.id);
    if (alertState === 'none') {
      await createSystemEvent(db, {
        changeType: 'SYSTEM_ALERT',
        monitorId: monitor.id,
        sourceUrl: monitor.url,
        key: `monitor-fetch-failure:${monitor.id}`,
        now,
        description: `${monitor.name} の取得に${consecutiveFailures}回連続で失敗しました（${request.status}）。`,
      });
    }
  }

  return { monitorId: monitor.id, status: 'failed', changeId: null };
}

async function handleSuccess(
  db: D1Database,
  monitor: Monitor,
  priorState: Awaited<ReturnType<typeof getMonitorState>>,
  request: RunnerResultRequest,
  now: string,
): Promise<RunnerResultResponse> {
  const newHash = await computeResultHash(request.values);
  const wasFailing = (priorState?.consecutiveFailures ?? 0) > 0;
  const isBaseline = !priorState || priorState.status === 'UNCHECKED';

  if (wasFailing) {
    const alertState = await getMonitorAlertState(db, monitor.id);
    if (alertState === 'active') {
      await createSystemEvent(db, {
        changeType: 'SYSTEM_RECOVERY',
        monitorId: monitor.id,
        sourceUrl: monitor.url,
        key: `monitor-fetch-failure:${monitor.id}`,
        now,
        description: `${monitor.name} の取得が復旧しました。`,
      });
    }
  }

  if (isBaseline) {
    await upsertMonitorState(
      db,
      monitor.id,
      {
        status: 'BASELINED',
        currentValue: request.values,
        currentHash: newHash,
        lastCheckedAt: now,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      now,
    );
    return { monitorId: monitor.id, status: 'baselined', changeId: null };
  }

  if (priorState && priorState.currentHash === newHash) {
    await upsertMonitorState(
      db,
      monitor.id,
      {
        status: 'OK',
        lastCheckedAt: now,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      now,
    );
    return { monitorId: monitor.id, status: 'unchanged', changeId: null };
  }

  const fingerprint = await computeChangeFingerprint(
    monitor.id,
    priorState?.currentHash ?? null,
    newHash,
  );
  const duplicate = await findChangeByFingerprint(db, monitor.id, fingerprint);
  if (duplicate) {
    await upsertMonitorState(
      db,
      monitor.id,
      {
        status: 'CHANGED',
        currentValue: request.values,
        currentHash: newHash,
        lastCheckedAt: now,
        lastSuccessAt: now,
        lastChangedAt: duplicate.detectedAt,
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      now,
    );
    return { monitorId: monitor.id, status: 'duplicate', changeId: duplicate.id };
  }

  const changedSelectionIds = diffSelectionIds(priorState?.currentValue ?? null, request.values);
  const change = await insertChange(db, {
    id: generateId(),
    feedId: monitor.feedId,
    monitorId: monitor.id,
    detectedAt: now,
    changeType: 'CHANGED',
    oldValue: priorState?.currentValue ?? null,
    newValue: request.values,
    changedSelectionIds,
    changeFingerprint: fingerprint,
    guid: `urn:web-monitor:change:${generateId()}`,
    sourceUrl: monitor.url,
  });

  await upsertMonitorState(
    db,
    monitor.id,
    {
      status: 'CHANGED',
      currentValue: request.values,
      currentHash: newHash,
      lastCheckedAt: now,
      lastSuccessAt: now,
      lastChangedAt: now,
      consecutiveFailures: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    now,
  );

  return { monitorId: monitor.id, status: 'changed', changeId: change.id };
}

function diffSelectionIds(
  previous: ExtractedSelectionValue[] | null,
  current: ExtractedSelectionValue[],
): string[] {
  const previousMap = new Map((previous ?? []).map((v) => [v.selectionId, v.comparisonValue]));
  const changed: string[] = [];
  for (const value of current) {
    const previousValue = previousMap.get(value.selectionId);
    if (JSON.stringify(previousValue) !== JSON.stringify(value.comparisonValue)) {
      changed.push(value.selectionId);
    }
  }
  return changed;
}
