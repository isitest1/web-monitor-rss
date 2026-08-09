import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FeedWithPlaintextToken } from '@web-monitor/shared';
import { testApp } from './test-app.js';
import { loginAsAdmin } from './support.js';

describe('feed and RSS token lifecycle', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM monitor_state');
    await env.DB.exec('DELETE FROM selections');
    await env.DB.exec('DELETE FROM monitors');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');
  });

  it('issues a one-time plaintext token on creation and serves RSS with it', async () => {
    const admin = await loginAsAdmin(env);
    const createRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'テストFeed', slug: 'test-feed', kind: 'content' }),
    });
    expect(createRes.status).toBe(201);
    const feed = await createRes.json<FeedWithPlaintextToken>();
    expect(feed.rssToken).toBeTruthy();
    expect(feed.rssUrl).toContain(feed.rssToken);

    const rssRes = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    expect(rssRes.status).toBe(200);
    expect(rssRes.headers.get('content-type')).toContain('application/rss+xml');
    const xml = await rssRes.text();
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('テストFeed');
    expect(rssRes.headers.get('etag')).toBeTruthy();
  });

  it('returns 304 when If-None-Match matches the current ETag', async () => {
    const admin = await loginAsAdmin(env);
    const createRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'ETagFeed', slug: 'etag-feed', kind: 'content' }),
    });
    const feed = await createRes.json<FeedWithPlaintextToken>();

    const first = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await testApp().request(
      `/rss/${feed.rssToken}.xml`,
      { headers: { 'if-none-match': etag ?? '' } },
      env,
    );
    expect(second.status).toBe(304);
  });

  it('rejects RSS access for a revoked token', async () => {
    const admin = await loginAsAdmin(env);
    const createRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'RevokeFeed', slug: 'revoke-feed', kind: 'content' }),
    });
    const feed = await createRes.json<FeedWithPlaintextToken>();

    const revokeRes = await admin.request(`/api/feeds/${feed.id}/revoke-token`, { method: 'POST' });
    expect(revokeRes.status).toBe(200);

    const rssRes = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    expect(rssRes.status).toBe(404);
  });

  it('rotating a token invalidates the previous one and issues a new plaintext token', async () => {
    const admin = await loginAsAdmin(env);
    const createRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'RotateFeed', slug: 'rotate-feed', kind: 'content' }),
    });
    const feed = await createRes.json<FeedWithPlaintextToken>();
    const oldToken = feed.rssToken;

    const rotateRes = await admin.request(`/api/feeds/${feed.id}/rotate-token`, { method: 'POST' });
    expect(rotateRes.status).toBe(200);
    const rotated = await rotateRes.json<FeedWithPlaintextToken>();
    expect(rotated.rssToken).not.toBe(oldToken);

    const oldRes = await testApp().request(`/rss/${oldToken}.xml`, {}, env);
    expect(oldRes.status).toBe(404);

    const newRes = await testApp().request(`/rss/${rotated.rssToken}.xml`, {}, env);
    expect(newRes.status).toBe(200);
  });

  it('rejects creating a feed with a duplicate slug', async () => {
    const admin = await loginAsAdmin(env);
    await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup', slug: 'dup-feed', kind: 'content' }),
    });
    const second = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup2', slug: 'dup-feed', kind: 'content' }),
    });
    expect(second.status).toBe(409);
  });
});
