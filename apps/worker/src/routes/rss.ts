import { Hono } from 'hono';
import type { Env } from '../env.js';
import { sha256Hex } from '../lib/crypto.js';
import { nowIso } from '../lib/time.js';
import { getFeedByTokenHash, touchTokenLastUsed } from '../db/repositories/feeds.js';
import { generateFeedRss } from '../rss/generate.js';

export const rssRoutes = new Hono<{ Bindings: Env }>();

rssRoutes.get('/:tokenWithExt', async (c) => {
  const raw = c.req.param('tokenWithExt');
  if (!raw.endsWith('.xml')) return c.text('not found', 404);
  const token = raw.slice(0, -'.xml'.length);
  if (!token) return c.text('not found', 404);

  const tokenHash = await sha256Hex(token);
  const feed = await getFeedByTokenHash(c.env.DB, tokenHash);
  if (!feed) return c.text('not found', 404);

  const channelLink = new URL(c.req.url).origin;
  const { xml, lastBuildDate } = await generateFeedRss(c.env.DB, feed, channelLink);

  const etag = `"${await sha256Hex(xml)}"`;
  const lastModified = new Date(lastBuildDate).toUTCString();

  const ifNoneMatch = c.req.header('if-none-match');
  const ifModifiedSince = c.req.header('if-modified-since');
  const notModified =
    ifNoneMatch === etag ||
    (!!ifModifiedSince && new Date(ifModifiedSince) >= new Date(lastBuildDate));

  await touchTokenLastUsed(c.env.DB, feed.id, nowIso());

  c.header('ETag', etag);
  c.header('Last-Modified', lastModified);
  c.header('Cache-Control', 'private, max-age=300');

  if (notModified) {
    return c.body(null, 304);
  }

  c.header('Content-Type', 'application/rss+xml; charset=UTF-8');
  return c.body(xml, 200);
});
