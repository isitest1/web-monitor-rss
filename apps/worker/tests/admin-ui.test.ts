import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FeedWithPlaintextToken, MonitorWithSelections } from '@web-monitor/shared';
import { testApp } from './test-app.js';
import { loginAsAdmin } from './support.js';

describe('admin UI pages', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM checks');
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM monitor_state');
    await env.DB.exec('DELETE FROM selections');
    await env.DB.exec('DELETE FROM monitors');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');
  });

  it('redirects unauthenticated visitors to /login', async () => {
    const res = await testApp().request('/monitors', { redirect: 'manual' }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('serves the login page at /login', async () => {
    const res = await testApp().request('/login', {}, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ログイン');
  });

  it('renders the Watchlist with monitor state and a stale-heartbeat banner', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'UI Feed', slug: 'ui-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();
    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'UI Monitor',
        url: 'https://example.com/ui',
        selections: [
          { label: '見出し', selectorType: 'css', selector: '#h', extractionMode: 'text' },
        ],
      }),
    });
    const monitor = await monitorRes.json<MonitorWithSelections>();

    await env.DB.prepare(
      "UPDATE system_state SET alert_status = 'stale', last_runner_success_at = ? WHERE id = 1",
    )
      .bind('2020-01-01T00:00:00.000Z')
      .run();

    const page = await admin.request('/monitors');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('UI Monitor');
    expect(html).toContain('UI Feed');
    expect(html).toContain('稼働停止の疑い');
    expect(html).toContain(`/monitors/${monitor.id}/history`);
  });

  it('renders the monitor history page with change and check rows', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'History Feed', slug: 'history-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();
    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'History Monitor',
        url: 'https://example.com/history',
        selections: [{ label: '値', selectorType: 'css', selector: '#v', extractionMode: 'text' }],
      }),
    });
    const monitor = await monitorRes.json<MonitorWithSelections>();

    const page = await admin.request(`/monitors/${monitor.id}/history`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('History Monitor');
    expect(html).toContain('変更履歴');
    expect(html).toContain('確認履歴');
  });

  it('returns 404 for a history page of an unknown monitor', async () => {
    const admin = await loginAsAdmin(env);
    const page = await admin.request('/monitors/does-not-exist/history');
    expect(page.status).toBe(404);
  });

  it('renders the feeds management page with a create form and token status', async () => {
    const admin = await loginAsAdmin(env);
    await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Feeds Page Feed', slug: 'feeds-page-feed', kind: 'content' }),
    });

    const page = await admin.request('/feeds');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Feeds Page Feed');
    expect(html).toContain('create-feed-form');
    expect(html).toContain('有効');
  });
});
