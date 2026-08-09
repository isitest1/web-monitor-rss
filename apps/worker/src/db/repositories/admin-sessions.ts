export interface AdminSessionRow {
  id: string;
  session_token_hash: string;
  csrf_token_hash: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked: number;
  user_agent_hash: string | null;
}

export interface InsertAdminSessionInput {
  id: string;
  sessionTokenHash: string;
  csrfTokenHash: string;
  createdAt: string;
  expiresAt: string;
  userAgentHash: string | null;
}

export async function insertAdminSession(
  db: D1Database,
  input: InsertAdminSessionInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_sessions (
        id, session_token_hash, csrf_token_hash, created_at, last_seen_at, expires_at, revoked,
        user_agent_hash
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(
      input.id,
      input.sessionTokenHash,
      input.csrfTokenHash,
      input.createdAt,
      input.createdAt,
      input.expiresAt,
      input.userAgentHash,
    )
    .run();
}

export async function getActiveSessionByTokenHash(
  db: D1Database,
  sessionTokenHash: string,
  now: string,
): Promise<AdminSessionRow | null> {
  const row = await db
    .prepare(
      `SELECT * FROM admin_sessions
       WHERE session_token_hash = ? AND revoked = 0 AND expires_at > ?`,
    )
    .bind(sessionTokenHash, now)
    .first<AdminSessionRow>();
  return row ?? null;
}

export async function touchSession(db: D1Database, id: string, now: string): Promise<void> {
  await db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?').bind(now, id).run();
}

export async function revokeSessionByTokenHash(
  db: D1Database,
  sessionTokenHash: string,
): Promise<void> {
  await db
    .prepare('UPDATE admin_sessions SET revoked = 1 WHERE session_token_hash = ?')
    .bind(sessionTokenHash)
    .run();
}

export async function purgeExpiredSessions(db: D1Database, now: string): Promise<void> {
  await db
    .prepare('DELETE FROM admin_sessions WHERE expires_at <= ? OR revoked = 1')
    .bind(now)
    .run();
}
