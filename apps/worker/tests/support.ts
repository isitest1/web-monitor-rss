import type { Env } from '../src/env.js';
import { testApp } from './test-app.js';

export interface AdminClient {
  cookie: string;
  csrfToken: string;
  request(path: string, init?: RequestInit): Promise<Response>;
}

export async function loginAsAdmin(env: Env): Promise<AdminClient> {
  const res = await testApp().request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: env.ADMIN_LOGIN_SECRET }),
    },
    env,
  );
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = /web_monitor_session=[^;]+/.exec(setCookie);
  if (!match) throw new Error('login did not set a session cookie');
  const { csrfToken } = await res.json<{ csrfToken: string }>();
  const cookie = match[0];

  return {
    cookie,
    csrfToken,
    async request(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      headers.set('cookie', cookie);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      if (init.method && init.method !== 'GET') {
        headers.set('x-csrf-token', csrfToken);
      }
      return testApp().request(path, { ...init, headers }, env);
    },
  };
}
