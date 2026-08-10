import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../env.js';
import { constantTimeEqual, hmacSha256Hex, randomToken, sha256Hex } from '../lib/crypto.js';
import { generateId } from '../lib/ids.js';
import {
  getActiveSessionByTokenHash,
  insertAdminSession,
  revokeSessionByTokenHash,
  touchSession,
  type AdminSessionRow,
} from '../db/repositories/admin-sessions.js';

export const SESSION_COOKIE_NAME = 'web_monitor_session';

function sessionTtlSeconds(env: Env): number {
  const parsed = Number(env.ADMIN_SESSION_TTL_SEC);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 604_800;
}

/**
 * The CSRF token is derived deterministically from the session token via
 * HMAC, rather than stored as an independent random value. The admin UI is
 * server-rendered (no SPA state to hold a value returned only once), so the
 * server must be able to recompute a valid CSRF token on every page render
 * from the session cookie alone, without ever persisting a CSRF plaintext.
 */
export async function deriveCsrfToken(env: Env, sessionToken: string): Promise<string> {
  return hmacSha256Hex(env.SESSION_SIGNING_SECRET, sessionToken);
}

export async function createAdminSession<E extends { Bindings: Env }>(
  c: Context<E>,
): Promise<{ csrfToken: string }> {
  const sessionToken = randomToken(32);
  const csrfToken = await deriveCsrfToken(c.env, sessionToken);
  const now = new Date();
  const ttlSec = sessionTtlSeconds(c.env);
  const expiresAt = new Date(now.getTime() + ttlSec * 1000);
  const userAgent = c.req.header('user-agent') ?? '';

  await insertAdminSession(c.env.DB, {
    id: generateId(),
    sessionTokenHash: await sha256Hex(sessionToken),
    csrfTokenHash: await sha256Hex(csrfToken),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    userAgentHash: userAgent ? await sha256Hex(userAgent) : null,
  });

  setCookie(c, SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    // Lax, not Strict: the Chrome extension popup (a different origin,
    // chrome-extension://...) links to /monitors as a normal top-level
    // GET navigation. Strict withholds the cookie on any cross-site-
    // initiated top-level navigation, which broke that link (always
    // landing on /login even with a valid session). Lax still excludes
    // the cookie from cross-site POST/PUT/DELETE, so CSRF protection is
    // unchanged for anything state-changing.
    sameSite: 'Lax',
    path: '/',
    maxAge: ttlSec,
  });

  return { csrfToken };
}

export interface AdminSessionContext {
  row: AdminSessionRow;
  sessionToken: string;
}

export async function getAdminSessionRow<E extends { Bindings: Env }>(
  c: Context<E>,
): Promise<AdminSessionContext | null> {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionToken) return null;
  const hash = await sha256Hex(sessionToken);
  const row = await getActiveSessionByTokenHash(c.env.DB, hash, new Date().toISOString());
  if (!row) return null;
  await touchSession(c.env.DB, row.id, new Date().toISOString());
  return { row, sessionToken };
}

export async function destroyAdminSession<E extends { Bindings: Env }>(
  c: Context<E>,
): Promise<void> {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) {
    await revokeSessionByTokenHash(c.env.DB, await sha256Hex(sessionToken));
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
}

export async function verifyCsrfToken(
  env: Env,
  session: AdminSessionContext,
  candidate: string | undefined,
): Promise<boolean> {
  if (!candidate) return false;
  const expected = await deriveCsrfToken(env, session.sessionToken);
  return constantTimeEqual(candidate, expected);
}
