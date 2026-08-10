import { Hono } from 'hono';
import { runnerResultRequestSchema, type RunnerMonitorListResponse } from '@web-monitor/shared';
import type { Env } from '../env.js';
import { errorJson } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';
import { requireExtensionOnlyToken } from '../auth/middleware.js';
import { listDueMonitors, getMonitorById } from '../db/repositories/monitors.js';
import {
  listSelectionsByMonitorIds,
  listSelectionsByMonitor,
} from '../db/repositories/selections.js';
import { processRunnerResult } from '../changes/detect.js';

/**
 * Mirrors /api/runner/* (apps/worker/src/routes/runner.ts) for Monitors
 * with execution_mode 'local': the Chrome extension fetches its own due
 * Monitors and submits results the same way the GitHub Actions Runner does,
 * reusing processRunnerResult so baseline/change-detection behavior is
 * identical regardless of which source ran the check. Unlike the Runner
 * routes, this never touches system_state/heartbeat (§8.6's watchdog stays
 * scoped to the Runner; local checks are best-effort while Chrome is open).
 */
export const extensionRunnerRoutes = new Hono<{ Bindings: Env }>();

extensionRunnerRoutes.use('*', requireExtensionOnlyToken);

extensionRunnerRoutes.get('/monitors', async (c) => {
  const monitors = await listDueMonitors(c.env.DB, {
    executionMode: 'local',
    nowIso: nowIso(),
  });
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

extensionRunnerRoutes.post('/results', async (c) => {
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

  const origin = new URL(c.req.url).origin;
  const result = await processRunnerResult({ db: c.env.DB, monitor, request: parsed.data, origin });
  return c.json(result);
});
