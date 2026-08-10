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

async function extensionRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${env.EXTENSION_API_TOKEN}`);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return testApp().request(path, { ...init, headers }, env);
}

async function setLastCheckedAt(monitorId: string, isoValue: string | null): Promise<void> {
  await env.DB.prepare('UPDATE monitor_state SET last_checked_at = ? WHERE monitor_id = ?')
    .bind(isoValue, monitorId)
    .run();
}

function isoSecondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe('execution_mode / check_interval_sec due-filtering', () => {
  let feed: FeedWithPlaintextToken;

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
      body: JSON.stringify({ name: 'Exec Mode Feed', slug: 'exec-mode-feed', kind: 'content' }),
    });
    feed = await feedRes.json<FeedWithPlaintextToken>();
  });

  async function createMonitor(overrides: Record<string, unknown> = {}) {
    const admin = await loginAsAdmin(env);
    const res = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'テスト監視',
        url: 'https://example.com/page',
        monitorMode: 'single',
        checkIntervalSec: 3600,
        selections: [
          { label: '見出し', selectorType: 'css', selector: '#headline', extractionMode: 'text' },
        ],
        ...overrides,
      }),
    });
    expect(res.status).toBe(201);
    return res.json<MonitorWithSelections>();
  }

  it('defaults a newly created monitor to server execution and a 24h interval', async () => {
    const monitor = await createMonitor({ checkIntervalSec: undefined });
    expect(monitor.executionMode).toBe('server');
    expect(monitor.checkIntervalSec).toBe(86400);
  });

  it('rejects a check interval below the 1-hour floor', async () => {
    const admin = await loginAsAdmin(env);
    const res = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: '短すぎる間隔',
        url: 'https://example.com/too-frequent',
        checkIntervalSec: 60,
        selections: [{ label: '値', selectorType: 'css', selector: '#v', extractionMode: 'text' }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects lowering an existing monitor below the 1-hour floor via PUT', async () => {
    const monitor = await createMonitor();
    const admin = await loginAsAdmin(env);
    const res = await admin.request(`/api/monitors/${monitor.id}`, {
      method: 'PUT',
      body: JSON.stringify({ checkIntervalSec: 1800 }),
    });
    expect(res.status).toBe(400);
  });

  it('a never-checked monitor is immediately due', async () => {
    const monitor = await createMonitor();
    const res = await runnerRequest('/api/runner/monitors');
    const body = await res.json<{ monitors: MonitorWithSelections[] }>();
    expect(body.monitors.map((m) => m.id)).toContain(monitor.id);
  });

  it('a monitor checked well within its interval is not due', async () => {
    const monitor = await createMonitor({ checkIntervalSec: 3600 });
    await setLastCheckedAt(monitor.id, isoSecondsAgo(60));
    const res = await runnerRequest('/api/runner/monitors');
    const body = await res.json<{ monitors: MonitorWithSelections[] }>();
    expect(body.monitors.map((m) => m.id)).not.toContain(monitor.id);
  });

  it('a monitor checked past its interval is due again', async () => {
    const monitor = await createMonitor({ checkIntervalSec: 3600 });
    await setLastCheckedAt(monitor.id, isoSecondsAgo(3700));
    const res = await runnerRequest('/api/runner/monitors');
    const body = await res.json<{ monitors: MonitorWithSelections[] }>();
    expect(body.monitors.map((m) => m.id)).toContain(monitor.id);
  });

  it('a disabled monitor is never due, even past its interval', async () => {
    const monitor = await createMonitor({ checkIntervalSec: 3600, enabled: false });
    await setLastCheckedAt(monitor.id, isoSecondsAgo(7200));
    const res = await runnerRequest('/api/runner/monitors');
    const body = await res.json<{ monitors: MonitorWithSelections[] }>();
    expect(body.monitors.map((m) => m.id)).not.toContain(monitor.id);
  });

  it('routes server-mode monitors to the Runner list and local-mode monitors to the extension list, never both', async () => {
    const serverMonitor = await createMonitor({ executionMode: 'server', name: 'サーバー監視' });
    const localMonitor = await createMonitor({ executionMode: 'local', name: 'ローカル監視' });

    const runnerRes = await runnerRequest('/api/runner/monitors');
    const runnerBody = await runnerRes.json<{ monitors: MonitorWithSelections[] }>();
    const runnerIds = runnerBody.monitors.map((m) => m.id);
    expect(runnerIds).toContain(serverMonitor.id);
    expect(runnerIds).not.toContain(localMonitor.id);

    const extensionRes = await extensionRequest('/api/extension/monitors');
    const extensionBody = await extensionRes.json<{ monitors: MonitorWithSelections[] }>();
    const extensionIds = extensionBody.monitors.map((m) => m.id);
    expect(extensionIds).toContain(localMonitor.id);
    expect(extensionIds).not.toContain(serverMonitor.id);
  });
});

describe('/api/extension/* token separation', () => {
  it('rejects GET /api/extension/monitors without an extension token', async () => {
    const runnerTokenRes = await testApp().request(
      '/api/extension/monitors',
      { headers: { authorization: `Bearer ${env.RUNNER_API_TOKEN}` } },
      env,
    );
    expect(runnerTokenRes.status).toBe(401);

    const admin = await loginAsAdmin(env);
    const cookieRes = await admin.request('/api/extension/monitors');
    expect(cookieRes.status).toBe(401);

    const noAuthRes = await testApp().request('/api/extension/monitors', {}, env);
    expect(noAuthRes.status).toBe(401);
  });

  it('accepts GET /api/extension/monitors with the extension token', async () => {
    const res = await extensionRequest('/api/extension/monitors');
    expect(res.status).toBe(200);
  });

  it('rejects POST /api/extension/results without an extension token', async () => {
    const res = await testApp().request(
      '/api/extension/results',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RUNNER_API_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/extension/results reuses Runner change-detection behavior', () => {
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
      body: JSON.stringify({
        name: 'Local Result Feed',
        slug: 'local-result-feed',
        kind: 'content',
      }),
    });
    feed = await feedRes.json<FeedWithPlaintextToken>();

    const monitorRes = await admin.request('/api/monitors', {
      method: 'POST',
      body: JSON.stringify({
        feedId: feed.id,
        name: 'ローカル確認監視',
        url: 'https://example.com/local-page',
        executionMode: 'local',
        selections: [
          { label: '見出し', selectorType: 'css', selector: '#headline', extractionMode: 'text' },
        ],
      }),
    });
    monitor = await monitorRes.json<MonitorWithSelections>();
    selectionId = monitor.selections[0]!.id;
  });

  function successPayload(value: string, runId = 'local-run-1') {
    return {
      monitorId: monitor.id,
      runId,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'SUCCESS',
      durationMs: 800,
      httpStatus: 200,
      values: [{ selectionId, label: '見出し', displayValue: value, comparisonValue: value }],
    };
  }

  it('baselines the first local result and detects a change on the second', async () => {
    const first = await extensionRequest('/api/extension/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('初期値')),
    });
    expect(first.status).toBe(200);
    expect((await first.json<{ status: string }>()).status).toBe('baselined');

    const second = await extensionRequest('/api/extension/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('更新後の値', 'local-run-2')),
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json<{ status: string; changeId: string | null }>();
    expect(secondBody.status).toBe('changed');
    expect(secondBody.changeId).toBeTruthy();
  });

  it('does not touch the Runner heartbeat/system_state', async () => {
    const before = await env.DB.prepare(
      'SELECT last_runner_run_at, last_runner_success_at FROM system_state WHERE id = 1',
    ).first<{ last_runner_run_at: string | null; last_runner_success_at: string | null }>();

    await extensionRequest('/api/extension/results', {
      method: 'POST',
      body: JSON.stringify(successPayload('値')),
    });

    const after = await env.DB.prepare(
      'SELECT last_runner_run_at, last_runner_success_at FROM system_state WHERE id = 1',
    ).first<{ last_runner_run_at: string | null; last_runner_success_at: string | null }>();
    expect(after?.last_runner_run_at).toBe(before?.last_runner_run_at);
    expect(after?.last_runner_success_at).toBe(before?.last_runner_success_at);
  });
});
