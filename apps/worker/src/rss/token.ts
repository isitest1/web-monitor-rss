import type { Feed, FeedWithPlaintextToken } from '@web-monitor/shared';
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { setFeedToken, revokeFeedToken } from '../db/repositories/feeds.js';

const TOKEN_PREFIX_LENGTH = 8;

export function buildRssUrl(origin: string, token: string): string {
  return `${origin}/rss/${token}.xml`;
}

export async function issueNewFeedToken(
  db: D1Database,
  feed: Feed,
  origin: string,
  now: string,
): Promise<FeedWithPlaintextToken> {
  const plaintext = randomToken(32);
  const hash = await sha256Hex(plaintext);
  const prefix = plaintext.slice(0, TOKEN_PREFIX_LENGTH);
  await setFeedToken(db, feed.id, { hash, prefix, plaintext, issuedAt: now }, now);
  return {
    ...feed,
    rssTokenPrefix: prefix,
    rssTokenIssuedAt: now,
    rssTokenLastUsedAt: null,
    rssTokenStatus: 'active',
    updatedAt: now,
    rssToken: plaintext,
    rssUrl: buildRssUrl(origin, plaintext),
  };
}

export async function revokeCurrentFeedToken(
  db: D1Database,
  feedId: string,
  now: string,
): Promise<void> {
  await revokeFeedToken(db, feedId, now);
}
