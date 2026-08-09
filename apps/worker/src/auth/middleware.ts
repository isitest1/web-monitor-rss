import type { Context, Next } from 'hono';
import type { Env } from '../env.js';
import { constantTimeEqual } from '../lib/crypto.js';
import { errorJson } from '../lib/errors.js';
import { getAdminSessionRow, verifyCsrfToken, type AdminSessionContext } from './admin-session.js';

export const CSRF_HEADER_NAME = 'x-csrf-token';

type AppEnv = { Bindings: Env; Variables: { adminSession: AdminSessionContext } };

export async function requireAdminSession(
  c: Context<AppEnv>,
  next: Next,
): Promise<Response | void> {
  const session = await getAdminSessionRow(c);
  if (!session) {
    return errorJson(c, 401, 'UNAUTHENTICATED', 'admin session is required');
  }
  c.set('adminSession', session);
  await next();
}

export async function requireCsrf(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const session = c.get('adminSession');
  const candidate = c.req.header(CSRF_HEADER_NAME);
  if (!session || !(await verifyCsrfToken(c.env, session, candidate))) {
    return errorJson(c, 403, 'CSRF_INVALID', 'CSRF token is missing or invalid');
  }
  await next();
}

function extractBearerToken(c: Context): string | null {
  const header = c.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export function requireExtensionToken(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<Response | void> {
  const token = extractBearerToken(c);
  if (!token || !constantTimeEqual(token, c.env.EXTENSION_API_TOKEN)) {
    return Promise.resolve(errorJson(c, 401, 'UNAUTHENTICATED', 'extension token is invalid'));
  }
  return next();
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
