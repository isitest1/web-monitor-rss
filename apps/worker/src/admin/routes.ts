import { Hono } from 'hono';
import type { Env } from '../env.js';
import { deriveCsrfToken, getAdminSessionRow } from '../auth/admin-session.js';
import { loginPage } from './pages/login.js';
import { monitorsPage, type MonitorRow } from './pages/monitors.js';
import { monitorHistoryPage } from './pages/monitor-history.js';
import { feedsPage } from './pages/feeds.js';
import { listMonitors, getMonitorById } from '../db/repositories/monitors.js';
import { listMonitorStates } from '../db/repositories/monitor-state.js';
import { listFeeds } from '../db/repositories/feeds.js';
import { getSystemState } from '../db/repositories/system-state.js';
import { listChecksByMonitor } from '../db/repositories/checks.js';
import { listChangesByMonitor } from '../db/repositories/changes.js';
import { requireParam } from '../lib/errors.js';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.get('/', async (c) => {
  const session = await getAdminSessionRow(c);
  if (!session) return c.redirect('/login');
  return c.redirect('/monitors');
});

adminRoutes.get('/login', async (c) => {
  const session = await getAdminSessionRow(c);
  if (session) return c.redirect('/monitors');
  return c.html(loginPage());
});

adminRoutes.get('/monitors', async (c) => {
  const session = await getAdminSessionRow(c);
  if (!session) return c.redirect('/login');

  const [monitors, feeds, systemState] = await Promise.all([
    listMonitors(c.env.DB),
    listFeeds(c.env.DB),
    getSystemState(c.env.DB),
  ]);
  const states = await listMonitorStates(c.env.DB);
  const feedNameById = new Map(feeds.map((f) => [f.id, f.name]));

  const rows: MonitorRow[] = monitors.map((monitor) => ({
    monitor,
    state: states.get(monitor.id) ?? null,
    feedName: feedNameById.get(monitor.feedId) ?? '(不明)',
  }));

  const csrfToken = await deriveCsrfToken(c.env, session.sessionToken);
  return c.html(monitorsPage(rows, feeds, systemState, csrfToken));
});

adminRoutes.get('/monitors/:id/history', async (c) => {
  const session = await getAdminSessionRow(c);
  if (!session) return c.redirect('/login');

  const monitor = await getMonitorById(c.env.DB, requireParam(c, 'id'));
  if (!monitor) return c.notFound();

  const [checks, changes] = await Promise.all([
    listChecksByMonitor(c.env.DB, monitor.id, 100),
    listChangesByMonitor(c.env.DB, monitor.id, 100),
  ]);
  return c.html(monitorHistoryPage(monitor, checks, changes));
});

adminRoutes.get('/feeds', async (c) => {
  const session = await getAdminSessionRow(c);
  if (!session) return c.redirect('/login');

  const feeds = await listFeeds(c.env.DB);
  const csrfToken = await deriveCsrfToken(c.env, session.sessionToken);
  return c.html(feedsPage(feeds, csrfToken));
});
