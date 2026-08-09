import { Hono } from 'hono';
import {
  createMonitorRequestSchema,
  isBlockedMonitorHostname,
  updateMonitorRequestSchema,
} from '@web-monitor/shared';
import type { Env } from '../env.js';
import { errorJson, requireParam } from '../lib/errors.js';
import { generateId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { getFeedById } from '../db/repositories/feeds.js';
import {
  deleteMonitor,
  getMonitorById,
  insertMonitor,
  listMonitors,
  setMonitorEnabled,
  updateMonitor,
} from '../db/repositories/monitors.js';
import {
  listSelectionsByMonitor,
  listSelectionsByMonitorIds,
  replaceSelectionsForMonitor,
} from '../db/repositories/selections.js';
import {
  ensureMonitorState,
  getMonitorState,
  listMonitorStates,
} from '../db/repositories/monitor-state.js';
import { listChecksByMonitor } from '../db/repositories/checks.js';
import { listChangesByMonitor } from '../db/repositories/changes.js';
import {
  requireAdminOrExtensionAuth,
  requireCsrfForAdmin,
  type Actor,
} from '../auth/middleware.js';

export const monitorRoutes = new Hono<{
  Bindings: Env;
  Variables: { actor: Actor };
}>();

function isMonitorUrlAllowed(env: Env, url: string): boolean {
  if (env.ALLOW_PRIVATE_MONITOR_URLS === 'true') return true;
  return !isBlockedMonitorHostname(url);
}

// Both the admin UI (cookie session) and the Chrome extension (Extension
// API token) manage Monitor definitions, per §4/§10.
monitorRoutes.use('*', requireAdminOrExtensionAuth);

monitorRoutes.get('/', async (c) => {
  const monitors = await listMonitors(c.env.DB);
  const selectionsByMonitor = await listSelectionsByMonitorIds(
    c.env.DB,
    monitors.map((m) => m.id),
  );
  const states = await listMonitorStates(c.env.DB);
  return c.json({
    monitors: monitors.map((monitor) => ({
      ...monitor,
      selections: selectionsByMonitor.get(monitor.id) ?? [],
      state: states.get(monitor.id) ?? null,
    })),
  });
});

monitorRoutes.post('/', requireCsrfForAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createMonitorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      c,
      400,
      'INVALID_REQUEST',
      parsed.error.issues[0]?.message ?? 'invalid monitor',
    );
  }
  const feed = await getFeedById(c.env.DB, parsed.data.feedId);
  if (!feed)
    return errorJson(c, 400, 'INVALID_REQUEST', 'feedId does not reference an existing feed');
  if (!isMonitorUrlAllowed(c.env, parsed.data.url)) {
    return errorJson(c, 400, 'INVALID_REQUEST', 'URL is not allowed');
  }

  const now = nowIso();
  const monitor = await insertMonitor(c.env.DB, {
    id: generateId(),
    feedId: parsed.data.feedId,
    name: parsed.data.name,
    url: parsed.data.url,
    monitorMode: parsed.data.monitorMode,
    comparisonRule: parsed.data.comparisonRule,
    enabled: parsed.data.enabled,
    orderIndex: parsed.data.orderIndex,
    createdAt: now,
    updatedAt: now,
  });
  await replaceSelectionsForMonitor(c.env.DB, monitor.id, parsed.data.selections, generateId, now);
  await ensureMonitorState(c.env.DB, monitor.id, now);
  const selections = await listSelectionsByMonitor(c.env.DB, monitor.id);
  return c.json({ ...monitor, selections }, 201);
});

monitorRoutes.get('/:id', async (c) => {
  const monitor = await getMonitorById(c.env.DB, requireParam(c, 'id'));
  if (!monitor) return errorJson(c, 404, 'NOT_FOUND', 'monitor not found');
  const selections = await listSelectionsByMonitor(c.env.DB, monitor.id);
  const state = await getMonitorState(c.env.DB, monitor.id);
  return c.json({ ...monitor, selections, state });
});

monitorRoutes.put('/:id', requireCsrfForAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = updateMonitorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      c,
      400,
      'INVALID_REQUEST',
      parsed.error.issues[0]?.message ?? 'invalid monitor',
    );
  }
  const existing = await getMonitorById(c.env.DB, requireParam(c, 'id'));
  if (!existing) return errorJson(c, 404, 'NOT_FOUND', 'monitor not found');
  if (parsed.data.url && !isMonitorUrlAllowed(c.env, parsed.data.url)) {
    return errorJson(c, 400, 'INVALID_REQUEST', 'URL is not allowed');
  }

  const now = nowIso();
  const { selections, ...monitorPatch } = parsed.data;
  const updated = await updateMonitor(c.env.DB, existing.id, monitorPatch, now);
  if (selections) {
    await replaceSelectionsForMonitor(c.env.DB, existing.id, selections, generateId, now);
  }
  const currentSelections = await listSelectionsByMonitor(c.env.DB, existing.id);
  return c.json({ ...updated, selections: currentSelections });
});

monitorRoutes.delete('/:id', requireCsrfForAdmin, async (c) => {
  const existing = await getMonitorById(c.env.DB, requireParam(c, 'id'));
  if (!existing) return errorJson(c, 404, 'NOT_FOUND', 'monitor not found');
  await deleteMonitor(c.env.DB, existing.id);
  return c.body(null, 204);
});

monitorRoutes.post('/:id/enable', requireCsrfForAdmin, async (c) => {
  const updated = await setMonitorEnabled(c.env.DB, requireParam(c, 'id'), true, nowIso());
  if (!updated) return errorJson(c, 404, 'NOT_FOUND', 'monitor not found');
  return c.json(updated);
});

monitorRoutes.post('/:id/disable', requireCsrfForAdmin, async (c) => {
  const updated = await setMonitorEnabled(c.env.DB, requireParam(c, 'id'), false, nowIso());
  if (!updated) return errorJson(c, 404, 'NOT_FOUND', 'monitor not found');
  return c.json(updated);
});

monitorRoutes.get('/:id/history', async (c) => {
  const monitor = await getMonitorById(c.env.DB, requireParam(c, 'id'));
  if (!monitor) return errorJson(c, 404, 'NOT_FOUND', 'monitor not found');
  const [checks, changes] = await Promise.all([
    listChecksByMonitor(c.env.DB, monitor.id, 100),
    listChangesByMonitor(c.env.DB, monitor.id, 100),
  ]);
  return c.json({ checks, changes });
});
