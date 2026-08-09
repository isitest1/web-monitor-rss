import type { Feed } from '@web-monitor/shared';
import { generateId } from '../lib/ids.js';
import { insertFeed, getSystemFeed } from '../db/repositories/feeds.js';
import { issueNewFeedToken } from './token.js';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = generateId().slice(0, 8);
  return `${base || 'feed'}-${suffix}`;
}

/**
 * One Feed per Monitor is the default for this personal-use deployment
 * (chosen explicitly over manually picking/sharing Feeds): every new
 * Monitor gets its own dedicated content Feed, named after it, so its RSS
 * URL is immediately available with no extra setup step.
 */
export async function createDedicatedFeedForMonitor(
  db: D1Database,
  monitorName: string,
  origin: string,
  now: string,
): Promise<Feed> {
  const feed = await insertFeed(db, {
    id: generateId(),
    name: monitorName,
    slug: slugify(monitorName),
    kind: 'content',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  const withToken = await issueNewFeedToken(db, feed, origin, now);
  return withToken;
}

/**
 * The system feed (heartbeat/failure alerts) is not tied to any Monitor
 * and has no admin "create feed" UI to make it through, so it
 * self-bootstraps the first time something needs it.
 */
export async function getOrCreateSystemFeed(
  db: D1Database,
  origin: string,
  now: string,
): Promise<Feed> {
  const existing = await getSystemFeed(db);
  if (existing) return existing;
  const feed = await insertFeed(db, {
    id: generateId(),
    name: 'システム稼働通知',
    slug: slugify('system'),
    kind: 'system',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  return issueNewFeedToken(db, feed, origin, now);
}
