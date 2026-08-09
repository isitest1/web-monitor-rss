import { Hono } from 'hono';
import {
  heartbeatRequestSchema,
  runnerResultRequestSchema,
  type RunnerMonitorListResponse,
} from '@web-monitor/shared';
import type { Env } from '../env.js';
import { errorJson } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';
import { requireRunnerToken } from '../auth/middleware.js';
import { listEnabledMonitors, getMonitorById } from '../db/repositories/monitors.js';
import {
  listSelectionsByMonitorIds,
  listSelectionsByMonitor,
} from '../db/repositories/selections.js';
import { processRunnerResult } from '../changes/detect.js';
import { recordRunnerStart, recordRunnerSuccess } from '../db/repositories/system-state.js';
import { evaluateHeartbeat } from '../watchdog/check.js';

export const runnerRoutes = new Hono<{ Bindings: Env }>();

runnerRoutes.use('*', requireRunnerToken);

runnerRoutes.get('/monitors', async (c) => {
  const monitors = await listEnabledMonitors(c.env.DB);
  const selectionsByMonitor = await listSelectionsByMonitorIds(
    c.env.DB,
    monitors.map((m) => m.id),
  );
  const response: RunnerMonitorListResponse = {
    monitors: monitors.map((monitor) => ({
      ...monitor,
      selections: selectionsByMonitor.get(monitor.id) ?? [],
    })),
  };
  return c.json(response);
});

runnerRoutes.post('/results', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = runnerResultRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      c,
      400,
      'INVALID_REQUEST',
      parsed.error.issues[0]?.message ?? 'invalid result',
    );
  }
  const monitor = await getMonitorById(c.env.DB, parsed.data.monitorId);
  if (!monitor) return errorJson(c, 404, 'NOT_FOUND', 'monitor not found');

  const selections = await listSelectionsByMonitor(c.env.DB, monitor.id);
  const knownSelectionIds = new Set(selections.map((s) => s.id));
  for (const value of parsed.data.values) {
    if (!knownSelectionIds.has(value.selectionId)) {
      return errorJson(c, 400, 'INVALID_REQUEST', `unknown selectionId: ${value.selectionId}`);
    }
  }

  const result = await processRunnerResult({ db: c.env.DB, monitor, request: parsed.data });
  return c.json(result);
});

runnerRoutes.post('/heartbeat', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = heartbeatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      c,
      400,
      'INVALID_REQUEST',
      parsed.error.issues[0]?.message ?? 'invalid heartbeat',
    );
  }
  const now = nowIso();
  if (parsed.data.event === 'start') {
    await recordRunnerStart(c.env.DB, parsed.data.runId, now);
  } else {
    if (parsed.data.success !== false) {
      await recordRunnerSuccess(c.env.DB, now);
      await evaluateHeartbeat(c.env.DB, now);
    }
  }
  return c.json({ ok: true });
});
