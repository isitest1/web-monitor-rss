import type { Context, Next } from 'hono';
import type { Env } from '../env.js';
import { constantTimeEqual } from '../lib/crypto.js';
import { errorJson } from '../lib/errors.js';
import { getAdminSessionRow, verifyCsrfToken, type AdminSessionContext } from './admin-session.js';

export const CSRF_HEADER_NAME = 'x-csrf-token';

export interface Actor {
  type: 'admin' | 'extension';
  adminSession?: AdminSessionContext;
}

type ActorEnv = { Bindings: Env; Variables: { actor: Actor } };

function extractBearerToken(c: Context): string | null {
  const header = c.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export function requireRunnerToken(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const token = extractBearerToken(c);
  if (!token || !constantTimeEqual(token, c.env.RUNNER_API_TOKEN)) {
    return Promise.resolve(errorJson(c, 401, 'UNAUTHENTICATED', 'runner token is invalid'));
  }
  return next();
}

/**
 * Bearer-only, Extension-token-only (no admin cookie fallback), mirroring
 * requireRunnerToken exactly. Used for the extension's own local-check
 * result submission (§10/§4.1), which — unlike Monitor CRUD — must not be
 * reachable from an admin cookie session: it is a distinct source/token per
 * §10's "3種類の秘密値は...用途を越えて共用しない".
 */
export function requireExtensionOnlyToken(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const token = extractBearerToken(c);
  if (!token || !constantTimeEqual(token, c.env.EXTENSION_API_TOKEN)) {
    return Promise.resolve(errorJson(c, 401, 'UNAUTHENTICATED', 'extension token is invalid'));
  }
  return next();
}

/**
 * Admin-only endpoints that still share the `actor`-based Variables shape
 * (so requireCsrfForAdmin works uniformly), but never accept the Extension
 * API token — feed lifecycle/RSS token management stays an admin-panel
 * concern (§12).
 */
export async function requireAdminOnlyAuth(
  c: Context<ActorEnv>,
  next: Next,
): Promise<Response | void> {
  const session = await getAdminSessionRow(c);
  if (!session) {
    return errorJson(c, 401, 'UNAUTHENTICATED', 'admin session is required');
  }
  c.set('actor', { type: 'admin', adminSession: session });
  await next();
}

/**
 * Monitor/feed-listing endpoints are used by both the admin UI (cookie
 * session) and the Chrome extension (Extension API token) — the two
 * sources allowed to manage Monitor definitions, per §4/§10. This resolves
 * whichever is present and records which one for requireCsrfForAdmin.
 */
export async function requireAdminOrExtensionAuth(
  c: Context<ActorEnv>,
  next: Next,
): Promise<Response | void> {
  const bearer = extractBearerToken(c);
  if (bearer && constantTimeEqual(bearer, c.env.EXTENSION_API_TOKEN)) {
    c.set('actor', { type: 'extension' });
    return next();
  }

  const session = await getAdminSessionRow(c);
  if (session) {
    c.set('actor', { type: 'admin', adminSession: session });
    return next();
  }

  return errorJson(c, 401, 'UNAUTHENTICATED', 'admin session or extension token is required');
}

/**
 * CSRF only protects ambient-credential (cookie) auth; a Bearer token
 * requires the caller to have deliberately attached it, so extension
 * requests are inherently not CSRF-able and skip this check.
 */
export async function requireCsrfForAdmin(
  c: Context<ActorEnv>,
  next: Next,
): Promise<Response | void> {
  const actor = c.get('actor');
  if (actor.type === 'extension') {
    await next();
    return;
  }
  const candidate = c.req.header(CSRF_HEADER_NAME);
  if (!actor.adminSession || !(await verifyCsrfToken(c.env, actor.adminSession, candidate))) {
    return errorJson(c, 403, 'CSRF_INVALID', 'CSRF token is missing or invalid');
  }
  await next();
}
