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
    expect(xml).toMatch(
      /<title>Monitor &lt;A&gt; &amp; &quot;B&quot;: \[A &amp; B → &lt;script&gt;&amp;&quot;&apos;\]<\/title>/,
    );
  });

  it('puts the actual changed content in the title instead of just the change type', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Title Feed', slug: 'title-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Price Monitor',
        url: 'https://example.com/price',
        selections: [
          { label: '価格', selectorType: 'css', selector: '#p', extractionMode: 'text' },
        ],
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
        values: [{ selectionId, label: '価格', displayValue: '1980', comparisonValue: '1980' }],
      }),
    });
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        ...base,
        runId: 'r2',
        values: [{ selectionId, label: '価格', displayValue: '2180', comparisonValue: '2180' }],
      }),
    });

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    // "1980"→"2180" share the "80" suffix, so the scalar diff isolates just
    // the changed digits (same behavior as the description).
    expect(xml).toContain('<title>Price Monitor: [19 → 21]80</title>');
    expect(xml).not.toContain('- Changed<');
  });

  it('truncates an overly long title summary with an ellipsis', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Long Feed', slug: 'long-title-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Long Monitor',
        url: 'https://example.com/long',
        selections: [
          { label: '本文', selectorType: 'css', selector: '#b', extractionMode: 'text' },
        ],
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
        values: [{ selectionId, label: '本文', displayValue: 'a', comparisonValue: 'a' }],
      }),
    });
    const longValue = 'x'.repeat(200);
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        ...base,
        runId: 'r2',
        values: [
          { selectionId, label: '本文', displayValue: longValue, comparisonValue: longValue },
        ],
      }),
    });

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    // The channel itself also has a <title>, so take the item's (the last match).
    const titles = [...xml.matchAll(/<title>(.*?)<\/title>/gs)];
    const title = titles.at(-1)?.[1] ?? '';
    expect(title.length).toBeLessThan(150);
    expect(title).toContain('…');
  });

  it('omits the Selection label from the description when only one Selection changed', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Single Selection Feed', slug: 'single-sel', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Single Selection Monitor',
        url: 'https://example.com/single',
        selections: [
          { label: '選択1', selectorType: 'css', selector: '#v', extractionMode: 'text' },
        ],
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
        values: [{ selectionId, label: '選択1', displayValue: '100円', comparisonValue: '100' }],
      }),
    });
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        ...base,
        runId: 'r2',
        values: [{ selectionId, label: '選択1', displayValue: '200円', comparisonValue: '200' }],
      }),
    });

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    // "100円"→"200円" share the "00円" suffix, so the scalar diff isolates
    // just the changed digit rather than repeating the whole value.
    expect(xml).toContain('[1 → 2]00円');
    expect(xml).not.toContain('選択1:');
  });

  it('keeps each Selection label in the description when multiple Selections changed together', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Multi Selection Feed', slug: 'multi-sel', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Multi Selection Monitor',
        url: 'https://example.com/multi',
        selections: [
          { label: '価格', selectorType: 'css', selector: '#p', extractionMode: 'text' },
          { label: '在庫', selectorType: 'css', selector: '#s', extractionMode: 'text' },
        ],
      }),
    });
    const monitor = await monitorRes.json<MonitorWithSelections>();
    const [price, stock] = monitor.selections;

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
        values: [
          { selectionId: price!.id, label: '価格', displayValue: '100円', comparisonValue: '100' },
          { selectionId: stock!.id, label: '在庫', displayValue: 'あり', comparisonValue: 'あり' },
        ],
      }),
    });
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        ...base,
        runId: 'r2',
        values: [
          { selectionId: price!.id, label: '価格', displayValue: '200円', comparisonValue: '200' },
          { selectionId: stock!.id, label: '在庫', displayValue: 'なし', comparisonValue: 'なし' },
        ],
      }),
    });

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(xml).toContain('価格: [1 → 2]00円');
    expect(xml).toContain('在庫: [あり → なし]');
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

  it('advertises <ttl>/sy:updatePeriod matching the fastest enabled Monitor in the feed', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hourly Feed', slug: 'hourly-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Daily Monitor',
        url: 'https://example.com/daily',
        checkIntervalSec: 86400,
        selections: [{ label: 'v', selectorType: 'css', selector: '#v', extractionMode: 'text' }],
      }),
    });
    await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Hourly Monitor',
        url: 'https://example.com/hourly',
        checkIntervalSec: 3600,
        selections: [{ label: 'v', selectorType: 'css', selector: '#v', extractionMode: 'text' }],
      }),
    });

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(xml).toContain('xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"');
    expect(xml).toContain('<ttl>60</ttl>');
    expect(xml).toContain('<sy:updatePeriod>hourly</sy:updatePeriod>');
    expect(xml).toContain('<sy:updateFrequency>1</sy:updateFrequency>');
  });

  it('falls back to the default daily interval when a feed has no enabled Monitors', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'No Monitors', slug: 'no-monitors-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(xml).toContain('<ttl>1440</ttl>');
    expect(xml).toContain('<sy:updatePeriod>daily</sy:updatePeriod>');
  });

  it('renders a multi-line Selection value as <br/> in the description instead of one run-on line', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Multiline Feed', slug: 'multiline-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Multiline Monitor',
        url: 'https://example.com/list',
        selections: [
          { label: '一覧', selectorType: 'css', selector: '#v', extractionMode: 'text' },
        ],
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
        values: [{ selectionId, label: '一覧', displayValue: 'A', comparisonValue: 'A' }],
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
            label: '一覧',
            displayValue: 'Item 1\nItem 2\nItem 3',
            comparisonValue: 'Item 1 Item 2 Item 3',
          },
        ],
      }),
    });

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    // The channel itself also has a <description>, so take the item's (the last match).
    const descriptions = [...xml.matchAll(/<description>(.*?)<\/description>/gs)];
    const description = descriptions.at(-1)?.[1] ?? '';
    expect(description).toContain('<br/>');
    expect(description).not.toMatch(/Item 1[^<]*Item 2/);
    // The title is intentionally flattened to one line regardless.
    expect(xml).toMatch(/<title>Multiline Monitor: \[A → Item 1 Item 2 Item 3\]<\/title>/);
  });

  it("renders a Selection's captured images as <img> tags linked to the source page", async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Image Feed', slug: 'image-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'Image Monitor',
        url: 'https://example.com/card',
        selections: [
          { label: 'カード', selectorType: 'css', selector: '#v', extractionMode: 'text' },
        ],
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
        values: [{ selectionId, label: 'カード', displayValue: 'A', comparisonValue: 'A' }],
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
            label: 'カード',
            displayValue: 'B',
            comparisonValue: 'B',
            images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
          },
        ],
      }),
    });

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(xml).toContain(
      '<a href="https://example.com/card"><img src="https://example.com/img1.jpg" alt="" style="max-width:100%;height:auto;" /></a>',
    );
    expect(xml).toContain('img2.jpg');
  });

  it('advertises an hourly interval for the system feed, matching the watchdog cron', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'System', slug: 'system-feed-ttl', kind: 'system' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const xml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(xml).toContain('<ttl>60</ttl>');
    expect(xml).toContain('<sy:updatePeriod>hourly</sy:updatePeriod>');
  });
});
