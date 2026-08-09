import { Hono } from 'hono';
import { createFeedRequestSchema, updateFeedRequestSchema } from '@web-monitor/shared';
import type { Env } from '../env.js';
import { errorJson, requireParam } from '../lib/errors.js';
import { generateId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import {
  deleteFeed,
  getFeedById,
  getFeedBySlug,
  insertFeed,
  listFeeds,
  updateFeed,
} from '../db/repositories/feeds.js';
import { issueNewFeedToken, revokeCurrentFeedToken } from '../rss/token.js';
import { requireAdminSession, requireCsrf } from '../auth/middleware.js';
import type { AdminSessionContext } from '../auth/admin-session.js';

export const feedRoutes = new Hono<{
  Bindings: Env;
  Variables: { adminSession: AdminSessionContext };
}>();

feedRoutes.use('*', requireAdminSession);

function originFromRequest(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin;
}

feedRoutes.get('/', async (c) => {
  const feeds = await listFeeds(c.env.DB);
  return c.json({ feeds });
});

feedRoutes.post('/', requireCsrf, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createFeedRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(c, 400, 'INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'invalid feed');
  }
  const existing = await getFeedBySlug(c.env.DB, parsed.data.slug);
  if (existing) {
    return errorJson(c, 409, 'SLUG_TAKEN', 'a feed with this slug already exists');
  }
  const now = nowIso();
  const feed = await insertFeed(c.env.DB, {
    id: generateId(),
    name: parsed.data.name,
    slug: parsed.data.slug,
    kind: parsed.data.kind,
    enabled: parsed.data.enabled,
    createdAt: now,
    updatedAt: now,
  });
  const withToken = await issueNewFeedToken(c.env.DB, feed, originFromRequest(c), now);
  return c.json(withToken, 201);
});

feedRoutes.get('/:id', async (c) => {
  const feed = await getFeedById(c.env.DB, requireParam(c, 'id'));
  if (!feed) return errorJson(c, 404, 'NOT_FOUND', 'feed not found');
  return c.json(feed);
});

feedRoutes.put('/:id', requireCsrf, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = updateFeedRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(c, 400, 'INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'invalid feed');
  }
  const updated = await updateFeed(c.env.DB, requireParam(c, 'id'), parsed.data, nowIso());
  if (!updated) return errorJson(c, 404, 'NOT_FOUND', 'feed not found');
  return c.json(updated);
});

feedRoutes.delete('/:id', requireCsrf, async (c) => {
  const id = requireParam(c, 'id');
  const feed = await getFeedById(c.env.DB, id);
  if (!feed) return errorJson(c, 404, 'NOT_FOUND', 'feed not found');
  await deleteFeed(c.env.DB, id);
  return c.body(null, 204);
});

feedRoutes.post('/:id/rotate-token', requireCsrf, async (c) => {
  const feed = await getFeedById(c.env.DB, requireParam(c, 'id'));
  if (!feed) return errorJson(c, 404, 'NOT_FOUND', 'feed not found');
  const now = nowIso();
  const withToken = await issueNewFeedToken(c.env.DB, feed, originFromRequest(c), now);
  return c.json(withToken);
});

feedRoutes.post('/:id/revoke-token', requireCsrf, async (c) => {
  const feed = await getFeedById(c.env.DB, requireParam(c, 'id'));
  if (!feed) return errorJson(c, 404, 'NOT_FOUND', 'feed not found');
  const now = nowIso();
  await revokeCurrentFeedToken(c.env.DB, feed.id, now);
  const updated = await getFeedById(c.env.DB, feed.id);
  return c.json(updated);
});
