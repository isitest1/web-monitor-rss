import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  FeedWithPlaintextToken,
  MonitorWithSelections,
  RunnerResultResponse,
} from '@web-monitor/shared';
import { testApp } from './test-app.js';
import { loginAsAdmin } from './support.js';

async function runnerRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${env.RUNNER_API_TOKEN}`);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return testApp().request(path, { ...init, headers }, env);
}

describe('editing a Monitor via PUT preserves Selection ids', () => {
  let feed: FeedWithPlaintextToken;
  let monitor: MonitorWithSelections;

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM checks');
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM monitor_state');
    await env.DB.exec('DELETE FROM selections');
    await env.DB.exec('DELETE FROM monitors');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');

    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Edit Feed', slug: 'edit-feed', kind: 'content' }),
    });
    feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: '編集対象監視',
        url: 'https://example.com/edit-target',
        selections: [
          { label: '見出し', selectorType: 'css', selector: '#headline', extractionMode: 'text' },
          { label: '価格', selectorType: 'css', selector: '#price', extractionMode: 'text' },
        ],
      }),
    });
    monitor = await monitorRes.json<MonitorWithSelections>();
  });

  it('keeps existing Selection ids when they are included in the PUT payload', async () => {
    const admin = await loginAsAdmin(env);
    const [headline, price] = monitor.selections;

    const putRes = await admin.request(`/api/monitors/${monitor.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        selections: [
          {
            id: headline!.id,
            label: '見出し',
            selectorType: 'css',
            selector: '#headline',
            extractionMode: 'text',
          },
          {
            id: price!.id,
            label: '価格',
            selectorType: 'css',
            selector: '#price',
            extractionMode: 'text',
          },
          { label: '新規項目', selectorType: 'css', selector: '#new', extractionMode: 'text' },
        ],
      }),
    });
    expect(putRes.status).toBe(200);
    const updated = await putRes.json<MonitorWithSelections>();
    expect(updated.selections).toHaveLength(3);
    expect(updated.selections.find((s) => s.label === '見出し')?.id).toBe(headline!.id);
    expect(updated.selections.find((s) => s.label === '価格')?.id).toBe(price!.id);
    const newSelection = updated.selections.find((s) => s.label === '新規項目');
    expect(newSelection?.id).toBeTruthy();
    expect(newSelection?.id).not.toBe(headline!.id);
    expect(newSelection?.id).not.toBe(price!.id);
  });

  it('does not misreport untouched Selections as changed after an edit that only adds one', async () => {
    const admin = await loginAsAdmin(env);
    const [headline, price] = monitor.selections;

    const baseline = await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        monitorId: monitor.id,
        runId: 'run-1',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'SUCCESS',
        durationMs: 500,
        httpStatus: 200,
        values: [
          {
            selectionId: headline!.id,
            label: '見出し',
            displayValue: '安定した見出し',
            comparisonValue: '安定した見出し',
          },
          {
            selectionId: price!.id,
            label: '価格',
            displayValue: '¥1,000',
            comparisonValue: '¥1,000',
          },
        ],
      }),
    });
    expect((await baseline.json<RunnerResultResponse>()).status).toBe('baselined');

    const putRes = await admin.request(`/api/monitors/${monitor.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        selections: [
          {
            id: headline!.id,
            label: '見出し',
            selectorType: 'css',
            selector: '#headline',
            extractionMode: 'text',
          },
          {
            id: price!.id,
            label: '価格',
            selectorType: 'css',
            selector: '#price',
            extractionMode: 'text',
          },
          { label: '在庫', selectorType: 'css', selector: '#stock', extractionMode: 'text' },
        ],
      }),
    });
    const updated = await putRes.json<MonitorWithSelections>();
    const stockId = updated.selections.find((s) => s.label === '在庫')!.id;

    const second = await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        monitorId: monitor.id,
        runId: 'run-2',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'SUCCESS',
        durationMs: 500,
        httpStatus: 200,
        values: [
          {
            selectionId: headline!.id,
            label: '見出し',
            displayValue: '安定した見出し',
            comparisonValue: '安定した見出し',
          },
          {
            selectionId: price!.id,
            label: '価格',
            displayValue: '¥1,000',
            comparisonValue: '¥1,000',
          },
          {
            selectionId: stockId,
            label: '在庫',
            displayValue: '残り3点',
            comparisonValue: '残り3点',
          },
        ],
      }),
    });
    const secondBody = await second.json<RunnerResultResponse>();
    expect(secondBody.status).toBe('changed');

    const change = await env.DB.prepare(
      'SELECT changed_selection_ids_json FROM changes WHERE monitor_id = ? ORDER BY detected_at DESC LIMIT 1',
    )
      .bind(monitor.id)
      .first<{ changed_selection_ids_json: string }>();
    const changedIds = JSON.parse(change!.changed_selection_ids_json) as string[];
    expect(changedIds).toEqual([stockId]);
  });

  it('deletes Selections that are dropped from the PUT payload', async () => {
    const admin = await loginAsAdmin(env);
    const [headline] = monitor.selections;

    const putRes = await admin.request(`/api/monitors/${monitor.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        selections: [
          {
            id: headline!.id,
            label: '見出し',
            selectorType: 'css',
            selector: '#headline',
            extractionMode: 'text',
          },
        ],
      }),
    });
    const updated = await putRes.json<MonitorWithSelections>();
    expect(updated.selections).toHaveLength(1);
    expect(updated.selections[0]!.id).toBe(headline!.id);
  });
});

describe('groupName', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM checks');
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM monitor_state');
    await env.DB.exec('DELETE FROM selections');
    await env.DB.exec('DELETE FROM monitors');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');
  });

  it('defaults to null and round-trips through create/update', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Group Feed', slug: 'group-feed', kind: 'content' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const createRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'グループなし監視',
        url: 'https://example.com/group-test',
        selections: [{ label: '値', selectorType: 'css', selector: '#v', extractionMode: 'text' }],
      }),
    });
    const created = await createRes.json<MonitorWithSelections>();
    expect(created.groupName).toBeNull();

    const putRes = await admin.request(`/api/monitors/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({ groupName: '医薬品系' }),
    });
    const updated = await putRes.json<MonitorWithSelections>();
    expect(updated.groupName).toBe('医薬品系');

    const clearRes = await admin.request(`/api/monitors/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({ groupName: null }),
    });
    const cleared = await clearRes.json<MonitorWithSelections>();
    expect(cleared.groupName).toBeNull();
  });
});

describe('list-mode change description shows added/removed instead of full lists', () => {
  let feed: FeedWithPlaintextToken;
  let monitor: MonitorWithSelections;
  let selectionId: string;

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM checks');
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM monitor_state');
    await env.DB.exec('DELETE FROM selections');
    await env.DB.exec('DELETE FROM monitors');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');

    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'List Feed', slug: 'list-feed', kind: 'content' }),
    });
    feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: '一覧監視',
        url: 'https://example.com/list-target',
        monitorMode: 'list',
        selections: [
          { label: '項目', selectorType: 'css', selector: '.item', extractionMode: 'list' },
        ],
      }),
    });
    monitor = await monitorRes.json<MonitorWithSelections>();
    selectionId = monitor.selections[0]!.id;
  });

  it('shows 追加/削除 instead of the whole before/after list', async () => {
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        monitorId: monitor.id,
        runId: 'list-run-1',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'SUCCESS',
        durationMs: 500,
        httpStatus: 200,
        values: [
          { selectionId, label: '項目', displayValue: ['A', 'B'], comparisonValue: ['A', 'B'] },
        ],
      }),
    });

    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        monitorId: monitor.id,
        runId: 'list-run-2',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'SUCCESS',
        durationMs: 500,
        httpStatus: 200,
        values: [
          { selectionId, label: '項目', displayValue: ['B', 'C'], comparisonValue: ['B', 'C'] },
        ],
      }),
    });

    const rssRes = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    const xml = await rssRes.text();
    expect(xml).toContain('追加: C');
    expect(xml).toContain('削除: A');
    expect(xml).not.toContain('A, B &#x2192; B, C');

    const admin = await loginAsAdmin(env);
    const historyRes = await admin.request(`/monitors/${monitor.id}/history`);
    const historyHtml = await historyRes.text();
    expect(historyHtml).toContain('追加: C');
    expect(historyHtml).toContain('削除: A');
  });
});

describe('scalar (text-mode) change description shows only the changed portion in context', () => {
  let feed: FeedWithPlaintextToken;
  let monitor: MonitorWithSelections;
  let selectionId: string;

  const longTail =
    '。この商品は大変人気があり、在庫がなくなり次第終了となりますのでお早めにご検討ください。';

  beforeEach(async () => {
    await env.DB.exec('DELETE FROM checks');
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM monitor_state');
    await env.DB.exec('DELETE FROM selections');
    await env.DB.exec('DELETE FROM monitors');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');

    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Scalar Diff Feed', slug: 'scalar-diff-feed', kind: 'content' }),
    });
    feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: '長文監視',
        url: 'https://example.com/long-text-target',
        selections: [
          { label: '本文', selectorType: 'css', selector: '#body', extractionMode: 'text' },
        ],
      }),
    });
    monitor = await monitorRes.json<MonitorWithSelections>();
    selectionId = monitor.selections[0]!.id;
  });

  it('isolates a one-digit price change in a long paragraph instead of repeating it whole', async () => {
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        monitorId: monitor.id,
        runId: 'scalar-run-1',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'SUCCESS',
        durationMs: 500,
        httpStatus: 200,
        values: [
          {
            selectionId,
            label: '本文',
            displayValue: `価格は1000円です${longTail}`,
            comparisonValue: `価格は1000円です${longTail}`,
          },
        ],
      }),
    });

    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        monitorId: monitor.id,
        runId: 'scalar-run-2',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'SUCCESS',
        durationMs: 500,
        httpStatus: 200,
        values: [
          {
            selectionId,
            label: '本文',
            displayValue: `価格は2000円です${longTail}`,
            comparisonValue: `価格は2000円です${longTail}`,
          },
        ],
      }),
    });

    const rssRes = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    const xml = await rssRes.text();
    expect(xml).toContain('【1 → 2】');
    // The unchanged tail is long enough to be truncated with an ellipsis
    // rather than repeated in full.
    expect(xml).not.toContain('お早めにご検討ください');

    const admin = await loginAsAdmin(env);
    const historyRes = await admin.request(`/monitors/${monitor.id}/history`);
    const historyHtml = await historyRes.text();
    expect(historyHtml).toContain('【1 → 2】');
    expect(historyHtml).not.toContain('お早めにご検討ください');
  });
});
