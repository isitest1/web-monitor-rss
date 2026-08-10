import { Hono } from 'hono';
import type { Env } from '../env.js';
import { deriveCsrfToken, getAdminSessionRow } from '../auth/admin-session.js';
import { loginPage } from './pages/login.js';
import { monitorsPage, type MonitorFeedInfo, type MonitorRow } from './pages/monitors.js';
import { monitorHistoryPage } from './pages/monitor-history.js';
import { listMonitors, getMonitorById } from '../db/repositories/monitors.js';
import { listMonitorStates } from '../db/repositories/monitor-state.js';
import { getSystemFeed, listFeedsWithVisibleToken } from '../db/repositories/feeds.js';
import { getSystemState } from '../db/repositories/system-state.js';
import { listChecksByMonitor } from '../db/repositories/checks.js';
import {
  countPublishedChangesGroupedByFeed,
  listChangesByMonitor,
} from '../db/repositories/changes.js';
import { requireParam } from '../lib/errors.js';
import { buildRssUrl } from '../rss/token.js';
import { ITEM_LIMIT } from '../rss/generate.js';

export const adminRoutes = new Hono<{ Bindings: Env }>();

// Authenticated HTML must never be cached by the browser (or any proxy in
// between): a cached /login page served from bfcache/back-forward
// navigation would keep showing the login form even after a valid session
// exists, masking the server's own "already logged in" redirect entirely.
adminRoutes.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

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

  const origin = new URL(c.req.url).origin;
  const [monitors, systemState, systemFeed, feeds, itemCountsByFeed] = await Promise.all([
    listMonitors(c.env.DB),
    getSystemState(c.env.DB),
    getSystemFeed(c.env.DB),
    listFeedsWithVisibleToken(c.env.DB),
    countPublishedChangesGroupedByFeed(c.env.DB),
  ]);
  const states = await listMonitorStates(c.env.DB);

  const feedsById = new Map(feeds.map((f) => [f.id, f]));

  // Each Monitor owns exactly one dedicated Feed in this deployment, so its
  // row can look the Feed up directly rather than offering a picker.
  const rows: MonitorRow[] = monitors.map((monitor) => {
    const feed = feedsById.get(monitor.feedId);
    const feedInfo: MonitorFeedInfo = {
      id: monitor.feedId,
      rssUrl: feed?.rssTokenPlaintext ? buildRssUrl(origin, feed.rssTokenPlaintext) : null,
      rssTokenStatus: feed?.rssTokenStatus ?? null,
      // The RSS output itself caps at ITEM_LIMIT, so the displayed count
      // should never claim more items than the feed actually serves.
      itemCount: Math.min(itemCountsByFeed.get(monitor.feedId) ?? 0, ITEM_LIMIT),
    };
    return { monitor, state: states.get(monitor.id) ?? null, feed: feedInfo };
  });

  const systemFeedRecord = systemFeed ? feedsById.get(systemFeed.id) : undefined;
  const systemFeedUrl = systemFeedRecord?.rssTokenPlaintext
    ? buildRssUrl(origin, systemFeedRecord.rssTokenPlaintext)
    : null;

  const csrfToken = await deriveCsrfToken(c.env, session.sessionToken);
  return c.html(monitorsPage(rows, systemFeedUrl, systemState, csrfToken));
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
