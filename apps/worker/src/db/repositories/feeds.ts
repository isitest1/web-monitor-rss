import type { Feed, FeedKind, RssTokenStatus } from '@web-monitor/shared';

interface FeedRow {
  id: string;
  name: string;
  slug: string;
  kind: string;
  rss_token_hash: string | null;
  rss_token_prefix: string | null;
  rss_token_plaintext: string | null;
  rss_token_issued_at: string | null;
  rss_token_last_used_at: string | null;
  rss_token_status: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: FeedRow): Feed {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind as FeedKind,
    rssTokenPrefix: row.rss_token_prefix,
    rssTokenIssuedAt: row.rss_token_issued_at,
    rssTokenLastUsedAt: row.rss_token_last_used_at,
    rssTokenStatus: row.rss_token_status as RssTokenStatus | null,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The plaintext RSS token, visible any time in the admin UI (not just once
 * at issue/rotation) — a deliberate policy choice for this personal
 * single-user deployment. Kept out of `mapRow`/`Feed` so it is never
 * accidentally included in the Extension-facing feed list.
 */
export interface FeedWithVisibleToken extends Feed {
  rssTokenPlaintext: string | null;
}

function mapRowWithPlaintext(row: FeedRow): FeedWithVisibleToken {
  return { ...mapRow(row), rssTokenPlaintext: row.rss_token_plaintext };
}

export interface InsertFeedInput {
  id: string;
  name: string;
  slug: string;
  kind: FeedKind;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function insertFeed(db: D1Database, input: InsertFeedInput): Promise<Feed> {
  await db
    .prepare(
      `INSERT INTO feeds (
        id, name, slug, kind, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.name,
      input.slug,
      input.kind,
      input.enabled ? 1 : 0,
      input.createdAt,
      input.updatedAt,
    )
    .run();
  const created = await getFeedById(db, input.id);
  if (!created) throw new Error('failed to read back inserted feed');
  return created;
}

export async function getFeedById(db: D1Database, id: string): Promise<Feed | null> {
  const row = await db.prepare('SELECT * FROM feeds WHERE id = ?').bind(id).first<FeedRow>();
  return row ? mapRow(row) : null;
}

export async function getFeedBySlug(db: D1Database, slug: string): Promise<Feed | null> {
  const row = await db.prepare('SELECT * FROM feeds WHERE slug = ?').bind(slug).first<FeedRow>();
  return row ? mapRow(row) : null;
}

export async function getFeedByTokenHash(db: D1Database, tokenHash: string): Promise<Feed | null> {
  const row = await db
    .prepare('SELECT * FROM feeds WHERE rss_token_hash = ? AND rss_token_status = ?')
    .bind(tokenHash, 'active')
    .first<FeedRow>();
  return row ? mapRow(row) : null;
}

export async function getSystemFeed(db: D1Database): Promise<Feed | null> {
  const row = await db
    .prepare("SELECT * FROM feeds WHERE kind = 'system' ORDER BY created_at ASC LIMIT 1")
    .first<FeedRow>();
  return row ? mapRow(row) : null;
}

export async function listFeeds(db: D1Database): Promise<Feed[]> {
  const { results } = await db
    .prepare('SELECT * FROM feeds ORDER BY created_at ASC')
    .all<FeedRow>();
  return results.map(mapRow);
}

export async function listFeedsWithVisibleToken(db: D1Database): Promise<FeedWithVisibleToken[]> {
  const { results } = await db
    .prepare('SELECT * FROM feeds ORDER BY created_at ASC')
    .all<FeedRow>();
  return results.map(mapRowWithPlaintext);
}

export async function getFeedByIdWithVisibleToken(
  db: D1Database,
  id: string,
): Promise<FeedWithVisibleToken | null> {
  const row = await db.prepare('SELECT * FROM feeds WHERE id = ?').bind(id).first<FeedRow>();
  return row ? mapRowWithPlaintext(row) : null;
}

export async function updateFeed(
  db: D1Database,
  id: string,
  patch: { name?: string | undefined; enabled?: boolean | undefined },
  updatedAt: string,
): Promise<Feed | null> {
  const existing = await getFeedById(db, id);
  if (!existing) return null;
  const name = patch.name ?? existing.name;
  const enabled = patch.enabled ?? existing.enabled;
  await db
    .prepare('UPDATE feeds SET name = ?, enabled = ?, updated_at = ? WHERE id = ?')
    .bind(name, enabled ? 1 : 0, updatedAt, id)
    .run();
  return getFeedById(db, id);
}

export async function deleteFeed(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM feeds WHERE id = ?').bind(id).run();
}

export async function setFeedToken(
  db: D1Database,
  id: string,
  token: { hash: string; prefix: string; plaintext: string; issuedAt: string },
  updatedAt: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE feeds
       SET rss_token_hash = ?, rss_token_prefix = ?, rss_token_plaintext = ?, rss_token_issued_at = ?,
           rss_token_last_used_at = NULL, rss_token_status = 'active', updated_at = ?
       WHERE id = ?`,
    )
    .bind(token.hash, token.prefix, token.plaintext, token.issuedAt, updatedAt, id)
    .run();
}

export async function revokeFeedToken(
  db: D1Database,
  id: string,
  updatedAt: string,
): Promise<void> {
  await db
    .prepare(`UPDATE feeds SET rss_token_status = 'revoked', updated_at = ? WHERE id = ?`)
    .bind(updatedAt, id)
    .run();
}

export async function touchTokenLastUsed(
  db: D1Database,
  id: string,
  timestamp: string,
): Promise<void> {
  await db
    .prepare('UPDATE feeds SET rss_token_last_used_at = ? WHERE id = ?')
    .bind(timestamp, id)
    .run();
}
