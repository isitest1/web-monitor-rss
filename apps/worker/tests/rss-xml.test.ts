import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FeedWithPlaintextToken, MonitorWithSelections } from '@web-monitor/shared';
import { testApp } from './test-app.js';
import { loginAsAdmin } from './support.js';

async function runnerRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${env.RUNNER_API_TOKEN}`);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return testApp().request(path, { ...init, headers }, env);
}

describe('RSS XML escaping and validity', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM checks');
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM monitor_state');
    await env.DB.exec('DELETE FROM selections');
    await env.DB.exec('DELETE FROM monitors');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');
  });

  it('escapes XML special characters found in extracted values', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Escape & <Feed>', slug: 'escape-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Monitor <A> & "B"',
        url: 'https://example.com/a?x=1&y=2',
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
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        ...base,
        runId: 'r1',
        values: [{ selectionId, label: '値', displayValue: 'A & B', comparisonValue: 'A & B' }],
      }),
    });
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        ...base,
        runId: 'r2',
        values: [
          {
            selectionId,
            label: '値',
            displayValue: '<script>&"\'',
            comparisonValue: '<script>&"\'',
          },
        ],
      }),
    });

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toMatch(/<title>Monitor &lt;A&gt; &amp; &quot;B&quot; - 変更<\/title>/);
  });

  it('returns an empty but valid channel when a feed has no changes yet', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Empty', slug: 'empty-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();
    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</channel>');
  });
});
