import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { testApp } from './test-app.js';

function extractCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = /web_monitor_session=[^;]+/.exec(setCookie);
  if (!match) throw new Error('session cookie was not set');
  return match[0];
}

describe('admin auth', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM admin_sessions');
  });

  it('rejects an incorrect password', async () => {
    const res = await testApp().request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'wrong' }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('logs in with the correct password and returns a CSRF token', async () => {
    const res = await testApp().request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: env.ADMIN_LOGIN_SECRET }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ authenticated: boolean; csrfToken: string | null }>();
    expect(body.authenticated).toBe(true);
    expect(body.csrfToken).toBeTruthy();
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    expect(res.headers.get('set-cookie')).toContain('Secure');
    expect(res.headers.get('set-cookie')).toContain('SameSite=Strict');
  });

  it('reports session state via /api/auth/session and clears it on logout', async () => {
    const loginRes = await testApp().request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: env.ADMIN_LOGIN_SECRET }),
      },
      env,
    );
    const cookie = extractCookie(loginRes);

    const sessionRes = await testApp().request('/api/auth/session', { headers: { cookie } }, env);
    const sessionBody = await sessionRes.json<{
      authenticated: boolean;
      csrfToken: string | null;
    }>();
    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.csrfToken).toBeTruthy();

    await testApp().request('/api/auth/logout', { method: 'POST', headers: { cookie } }, env);

    const afterLogout = await testApp().request('/api/auth/session', { headers: { cookie } }, env);
    const afterLogoutBody = await afterLogout.json<{ authenticated: boolean }>();
    expect(afterLogoutBody.authenticated).toBe(false);
  });

  it('rejects a mutating admin request without a matching CSRF token', async () => {
    const loginRes = await testApp().request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: env.ADMIN_LOGIN_SECRET }),
      },
      env,
    );
    const cookie = extractCookie(loginRes);

    const res = await testApp().request(
      '/api/feeds',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'no csrf', slug: 'no-csrf', kind: 'content' }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it('accepts a mutating admin request with a valid CSRF token', async () => {
    const loginRes = await testApp().request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: env.ADMIN_LOGIN_SECRET }),
      },
      env,
    );
    const cookie = extractCookie(loginRes);
    const { csrfToken } = await loginRes.json<{ csrfToken: string }>();

    const res = await testApp().request(
      '/api/feeds',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ name: 'with csrf', slug: 'with-csrf', kind: 'content' }),
      },
      env,
    );
    expect(res.status).toBe(201);
  });

  it('rejects API access without any session cookie', async () => {
    const res = await testApp().request('/api/feeds', {}, env);
    expect(res.status).toBe(401);
  });
});

describe('extension and runner token separation', () => {
  it('rejects the runner endpoint when using the extension token', async () => {
    const res = await testApp().request(
      '/api/runner/monitors',
      { headers: { authorization: `Bearer ${env.EXTENSION_API_TOKEN}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('accepts the runner endpoint with the runner token', async () => {
    const res = await testApp().request(
      '/api/runner/monitors',
      { headers: { authorization: `Bearer ${env.RUNNER_API_TOKEN}` } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it('rejects requests with no bearer token at all', async () => {
    const res = await testApp().request('/api/runner/monitors', {}, env);
    expect(res.status).toBe(401);
  });
});
