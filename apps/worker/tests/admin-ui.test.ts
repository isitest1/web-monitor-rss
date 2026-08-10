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

  it('never lets the browser cache admin HTML, so a stale /login can never mask a valid session', async () => {
    const res = await testApp().request('/login', {}, env);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('renders the merged Watchlist with a monitor, its own RSS link, delete/rotate actions, and a stale-heartbeat banner', async () => {
    const admin = await loginAsAdmin(env);
    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
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
    expect(html).toContain('稼働停止の疑い');
    expect(html).toContain(`/monitors/${monitor.id}/history`);
    expect(html).toContain('RSSを見る');
    expect(html).toContain('delete-btn');
    expect(html).toContain('rotate-btn');
    expect(html).toContain('check-btn');
    // No more manual Feed picker or separate "create feed" section.
    expect(html).not.toContain('feed-select');
    expect(html).not.toContain('create-feed-form');
    // §: favicon/logo and full-width Watchlist layout.
    expect(html).toContain('rel="icon"');
    expect(html).toContain('max-width: none');
    expect(html).toContain('0件');
  });

  it('shows the number of published RSS items for a Monitor that has changed', async () => {
    const admin = await loginAsAdmin(env);
    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Item Count Monitor',
        url: 'https://example.com/count',
        selections: [{ label: '値', selectorType: 'css', selector: '#v', extractionMode: 'text' }],
      }),
    });
    const monitor = await monitorRes.json<MonitorWithSelections>();
    const selectionId = monitor.selections[0]!.id;

    const base = {
      monitorId: monitor.id,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'SUCCESS' as const,
      durationMs: 100,
      httpStatus: 200,
    };
    const runnerHeaders = { authorization: `Bearer ${env.RUNNER_API_TOKEN}` };
    await testApp().request(
      '/api/runner/results',
      {
        method: 'POST',
        headers: { ...runnerHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          ...base,
          runId: 'r1',
          values: [{ selectionId, label: '値', displayValue: 'A', comparisonValue: 'A' }],
        }),
      },
      env,
    );
    await testApp().request(
      '/api/runner/results',
      {
        method: 'POST',
        headers: { ...runnerHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          ...base,
          runId: 'r2',
          values: [{ selectionId, label: '値', displayValue: 'B', comparisonValue: 'B' }],
        }),
      },
      env,
    );

    const page = await admin.request('/monitors');
    const html = await page.text();
    expect(html).toContain('1件');
  });

  it('shows the auto-bootstrapped system feed URL once a stale alert exists', async () => {
    const admin = await loginAsAdmin(env);
    await env.DB.prepare(
      "UPDATE system_state SET alert_status = 'stale', last_runner_success_at = ? WHERE id = 1",
    )
      .bind('2020-01-01T00:00:00.000Z')
      .run();
    await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'システム稼働通知', slug: 'system-auto', kind: 'system' }),
    });

    const page = await admin.request('/monitors');
    const html = await page.text();
    expect(html).toContain('システム稼働通知RSS');
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

  it('no longer serves a separate /feeds management page', async () => {
    const admin = await loginAsAdmin(env);
    const page = await admin.request('/feeds');
    expect(page.status).toBe(404);
  });
});
