import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { testApp } from './test-app.js';

describe('CORS', () => {
  it('includes CORS headers on a real GET response for the extension origin', async () => {
    const res = await testApp().request(
      '/api/feeds',
      {
        headers: {
          origin: env.EXTENSION_ALLOWED_ORIGIN,
          authorization: `Bearer ${env.EXTENSION_API_TOKEN}`,
        },
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(env.EXTENSION_ALLOWED_ORIGIN);
  });

  it('includes CORS headers on the OPTIONS preflight response, not just real responses', async () => {
    const res = await testApp().request(
      '/api/feeds',
      {
        method: 'OPTIONS',
        headers: {
          origin: env.EXTENSION_ALLOWED_ORIGIN,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      },
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(env.EXTENSION_ALLOWED_ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  it('does not add CORS headers for an unrecognized origin', async () => {
    const res = await testApp().request(
      '/api/feeds',
      { method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } },
      env,
    );
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('accepts every origin in a comma-separated EXTENSION_ALLOWED_ORIGIN (e.g. an unpacked install alongside a Chrome Web Store install)', async () => {
    const other = 'chrome-extension://other-install-id';
    const app = testApp();
    const multiOriginEnv = {
      ...env,
      EXTENSION_ALLOWED_ORIGIN: `${env.EXTENSION_ALLOWED_ORIGIN}, ${other}`,
    };

    const first = await app.request(
      '/api/feeds',
      {
        headers: {
          origin: env.EXTENSION_ALLOWED_ORIGIN,
          authorization: `Bearer ${env.EXTENSION_API_TOKEN}`,
        },
      },
      multiOriginEnv,
    );
    expect(first.headers.get('access-control-allow-origin')).toBe(env.EXTENSION_ALLOWED_ORIGIN);

    const second = await app.request(
      '/api/feeds',
      { headers: { origin: other, authorization: `Bearer ${env.EXTENSION_API_TOKEN}` } },
      multiOriginEnv,
    );
    expect(second.headers.get('access-control-allow-origin')).toBe(other);

    const unrecognized = await app.request(
      '/api/feeds',
      { method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } },
      multiOriginEnv,
    );
    expect(unrecognized.headers.get('access-control-allow-origin')).toBeNull();
  });
});
