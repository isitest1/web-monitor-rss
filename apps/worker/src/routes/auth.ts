import { Hono } from 'hono';
import { loginRequestSchema, type SessionResponse } from '@web-monitor/shared';
import type { Env } from '../env.js';
import { constantTimeEqual } from '../lib/crypto.js';
import { errorJson } from '../lib/errors.js';
import { isRateLimited, recordFailedAttempt, resetAttempts } from '../auth/rate-limit.js';
import {
  createAdminSession,
  deriveCsrfToken,
  destroyAdminSession,
  getAdminSessionRow,
} from '../auth/admin-session.js';

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post('/login', async (c) => {
  const clientKey = c.req.header('cf-connecting-ip') ?? 'unknown';
  if (isRateLimited(clientKey)) {
    return errorJson(c, 429, 'RATE_LIMITED', 'too many login attempts, try again later');
  }

  const body = await c.req.json().catch(() => null);
  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(c, 400, 'INVALID_REQUEST', 'password is required');
  }

  if (!constantTimeEqual(parsed.data.password, c.env.ADMIN_LOGIN_SECRET)) {
    recordFailedAttempt(clientKey);
    return errorJson(c, 401, 'INVALID_CREDENTIALS', 'incorrect password');
  }

  resetAttempts(clientKey);
  const { csrfToken } = await createAdminSession(c);
  const response: SessionResponse = { authenticated: true, csrfToken };
  return c.json(response);
});

authRoutes.post('/logout', async (c) => {
  await destroyAdminSession(c);
  return c.json({ authenticated: false, csrfToken: null } satisfies SessionResponse);
});

authRoutes.get('/session', async (c) => {
  const session = await getAdminSessionRow(c);
  if (!session) {
    return c.json({ authenticated: false, csrfToken: null } satisfies SessionResponse);
  }
  const csrfToken = await deriveCsrfToken(c.env, session.sessionToken);
  return c.json({ authenticated: true, csrfToken } satisfies SessionResponse);
});
