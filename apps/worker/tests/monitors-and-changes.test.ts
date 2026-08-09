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

describe('monitor result processing and change detection', () => {
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
    await env.DB.exec(
      "UPDATE system_state SET last_runner_run_at = NULL, last_runner_success_at = NULL, alert_status = 'healthy', active_alert_change_id = NULL WHERE id = 1",
    );

    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Monitor Feed', slug: 'monitor-feed', kind: 'content' }),
    });
    feed = await feedRes.json<FeedWithPlaintextToken>();

    const systemFeedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'System Feed', slug: 'system-feed', kind: 'system' }),
    });
    await systemFeedRes.json();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'テスト監視',
        url: 'https://example.com/page',
        monitorMode: 'single',
        selections: [
          {
            label: '見出し',
            selectorType: 'css',
            selector: '#headline',
            extractionMode: 'text',
            matchMode: 'normalized',
          },
        ],
      }),
    });
    expect(monitorRes.status).toBe(201);
    monitor = await monitorRes.json<MonitorWithSelections>();
    selectionId = monitor.selections[0]!.id;
  });

  it('rejects a monitor URL pointing at localhost/private hosts by default', async () => {
    const admin = await loginAsAdmin(env);
    for (const url of [
      'http://localhost:4173/static.html',
      'http://127.0.0.1/admin',
      'http://169.254.169.254/latest/meta-data',
      'http://192.168.1.1/',
    ]) {
      const res = await admin.request('/api/monitors', {
        method: 'POST',
        body: JSON.stringify({
          feedId: feed.id,
          name: '拒否されるはず',
          url,
          selections: [
            { label: '値', selectorType: 'css', selector: '#v', extractionMode: 'text' },
          ],
        }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('lets an existing monitor be moved to a different feed via PUT', async () => {
    const admin = await loginAsAdmin(env);
    const otherFeedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'Other Feed', slug: 'other-feed', kind: 'content' }),
    });
    const otherFeed = await otherFeedRes.json<FeedWithPlaintextToken>();

    const putRes = await admin.request(`/api/monitors/${monitor.id}`, {
      method: 'PUT',
      body: JSON.stringify({ feedId: otherFeed.id }),
    });
    expect(putRes.status).toBe(200);
    const updated = await putRes.json<MonitorWithSelections>();
    expect(updated.feedId).toBe(otherFeed.id);

    const rejectRes = await admin.request(`/api/monitors/${monitor.id}`, {
      method: 'PUT',
      body: JSON.stringify({ feedId: 'does-not-exist' }),
    });
    expect(rejectRes.status).toBe(400);
  });

  it('exposes the monitor to the runner via GET /api/runner/monitors', async () => {
    const res = await runnerRequest('/api/runner/monitors');
    expect(res.status).toBe(200);
    const body = await res.json<{ monitors: MonitorWithSelections[] }>();
    expect(body.monitors.map((m) => m.id)).toContain(monitor.id);
  });

  function successPayload(value: string, runId = 'run-1') {
    return {
      monitorId: monitor.id,
      runId,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'SUCCESS',
      durationMs: 1200,
      httpStatus: 200,
      values: [
        {
          selectionId,
          label: '見出し',
          displayValue: value,
          comparisonValue: value,
        },
      ],
    };
  }

  it('treats the first successful result as a baseline with no change item', async () => {
    const res = await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('こんにちは')),
    });
    expect(res.status).toBe(200);
    const body = await res.json<RunnerResultResponse>();
    expect(body.status).toBe('baselined');
    expect(body.changeId).toBeNull();

    const rssRes = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    const xml = await rssRes.text();
    expect(xml).not.toContain('<item>');
  });

  it('does not create a change when the result is unchanged', async () => {
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('こんにちは')),
    });
    const res = await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('こんにちは', 'run-2')),
    });
    const body = await res.json<RunnerResultResponse>();
    expect(body.status).toBe('unchanged');
    expect(body.changeId).toBeNull();
  });

  it('creates exactly one change item when the value changes, and publishes it to RSS', async () => {
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('こんにちは')),
    });
    const res = await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('さようなら', 'run-2')),
    });
    const body = await res.json<RunnerResultResponse>();
    expect(body.status).toBe('changed');
    expect(body.changeId).toBeTruthy();

    const rssRes = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    const xml = await rssRes.text();
    expect(xml).toContain('<item>');
    expect(xml).toContain('こんにちは');
    expect(xml).toContain('さようなら');
    // The GUID must be derived from the same id returned as changeId, not
    // an unrelated random value, so RSS readers and API callers agree on
    // which change this is.
    expect(xml).toContain(`urn:web-monitor:change:${body.changeId}`);
  });

  it('does not insert a second change row when the same A->B transition is reprocessed', async () => {
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('A')),
    });
    const baselineState = await env.DB.prepare(
      'SELECT current_hash FROM monitor_state WHERE monitor_id = ?',
    )
      .bind(monitor.id)
      .first<{ current_hash: string }>();
    const hashOfA = baselineState?.current_hash;

    const first = await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('B', 'run-2')),
    });
    const firstBody = await first.json<RunnerResultResponse>();
    expect(firstBody.status).toBe('changed');

    // Simulate a retried/duplicate delivery of the same A->B transition
    // (e.g. runner retry racing state that was already advanced) by
    // resetting monitor_state back to the pre-change hash and resubmitting.
    await env.DB.prepare('UPDATE monitor_state SET current_hash = ? WHERE monitor_id = ?')
      .bind(hashOfA, monitor.id)
      .run();

    const resubmit = await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('B', 'run-2-retry')),
    });
    const resubmitBody = await resubmit.json<RunnerResultResponse>();
    expect(resubmitBody.status).toBe('duplicate');
    expect(resubmitBody.changeId).toBe(firstBody.changeId);

    const rssRes = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    const xml = await rssRes.text();
    expect(xml.split('<item>').length - 1).toBe(1);
  });

  it('does not overwrite the last successful value on a fetch failure', async () => {
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('安定した値')),
    });
    const failureRes = await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({
        monitorId: monitor.id,
        runId: 'run-fail',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: 'TIMEOUT',
        durationMs: 45000,
        httpStatus: null,
        errorCode: 'TIMEOUT',
        errorMessage: 'timed out',
        values: [],
      }),
    });
    const failureBody = await failureRes.json<RunnerResultResponse>();
    expect(failureBody.status).toBe('failed');

    const historyRes = await (await loginAsAdmin(env)).request(`/api/monitors/${monitor.id}`);
    const historyBody = await historyRes.json<{
      state: { currentValue: unknown; consecutiveFailures: number };
    }>();
    expect(historyBody.state.consecutiveFailures).toBe(1);
    expect(JSON.stringify(historyBody.state.currentValue)).toContain('安定した値');

    const rssRes = await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env);
    const xml = await rssRes.text();
    expect(xml).not.toContain('<item>');
  });

  it('raises a system-feed alert on the second consecutive failure and a recovery on success', async () => {
    const failurePayload = {
      monitorId: monitor.id,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'HTTP_ERROR',
      durationMs: 500,
      httpStatus: 500,
      errorCode: 'HTTP_ERROR',
      errorMessage: 'server error',
      values: [],
    };

    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({ ...failurePayload, runId: 'f1' }),
    });
    const admin = await loginAsAdmin(env);
    const systemFeedListRes = await admin.request('/api/feeds');
    const { feeds } = await systemFeedListRes.json<{
      feeds: { id: string; kind: string; rssToken?: string }[];
    }>();
    const systemFeed = feeds.find((f) => f.kind === 'system');
    if (!systemFeed) throw new Error('system feed missing');

    // First failure: history only, no alert yet.
    let sysRes = await admin.request(`/api/feeds/${systemFeed.id}/rotate-token`, {
      method: 'POST',
    });
    const sysFeedWithToken = await sysRes.json<FeedWithPlaintextToken>();
    let rssXml = await (
      await testApp().request(`/rss/${sysFeedWithToken.rssToken}.xml`, {}, env)
    ).text();
    expect(rssXml).not.toContain('稼働警告');

    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({ ...failurePayload, runId: 'f2' }),
    });
    rssXml = await (
      await testApp().request(`/rss/${sysFeedWithToken.rssToken}.xml`, {}, env)
    ).text();
    expect(rssXml).toContain('稼働警告');
    expect(rssXml.split('<item>').length - 1).toBe(1);

    // Third failure must not add a second alert item.
    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify({ ...failurePayload, runId: 'f3' }),
    });
    rssXml = await (
      await testApp().request(`/rss/${sysFeedWithToken.rssToken}.xml`, {}, env)
    ).text();
    expect(rssXml.split('<item>').length - 1).toBe(1);

    await runnerRequest('/api/runner/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('復旧しました', 'f4')),
    });
    rssXml = await (
      await testApp().request(`/rss/${sysFeedWithToken.rssToken}.xml`, {}, env)
    ).text();
    expect(rssXml).toContain('稼働回復');
  });
});
