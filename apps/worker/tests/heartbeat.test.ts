import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FeedWithPlaintextToken, HealthResponse } from '@web-monitor/shared';
import { testApp } from './test-app.js';
import { loginAsAdmin } from './support.js';
import { runWatchdogCron } from '../src/watchdog/check.js';

async function runnerRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${env.RUNNER_API_TOKEN}`);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return testApp().request(path, { ...init, headers }, env);
}

describe('runner heartbeat and watchdog', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');
    await env.DB.exec(
      "UPDATE system_state SET last_runner_run_at = NULL, last_runner_success_at = NULL, alert_status = 'healthy', active_alert_change_id = NULL, heartbeat_threshold_sec = 3600 WHERE id = 1",
    );
  });

  it('reports healthy with no runner history close enough to now', async () => {
    await runnerRequest('/api/runner/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ event: 'start', runId: 'run-a' }),
    });
    await runnerRequest('/api/runner/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ event: 'complete', runId: 'run-a', success: true }),
    });

    const res = await testApp().request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<HealthResponse>();
    expect(body.status).toBe('healthy');
    expect(body.lastRunnerSuccessAt).toBeTruthy();
  });

  it('creates exactly one stale alert on the system feed once past the threshold, then a recovery once healthy again', async () => {
    const admin = await loginAsAdmin(env);
    const feedRes = await admin.request('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: 'System', slug: 'system', kind: 'system' }),
    });
    const feed = await feedRes.json<FeedWithPlaintextToken>();

    const staleTimestamp = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    await env.DB.prepare('UPDATE system_state SET last_runner_success_at = ? WHERE id = 1')
      .bind(staleTimestamp)
      .run();

    await runWatchdogCron(env.DB, new Date().toISOString());
    await runWatchdogCron(env.DB, new Date().toISOString());

    let health = await (await testApp().request('/health', {}, env)).json<HealthResponse>();
    expect(health.status).toBe('stale');

    let rssXml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(rssXml.split('<item>').length - 1).toBe(1);
    expect(rssXml).toContain('稼働警告');

    await runnerRequest('/api/runner/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ event: 'complete', runId: 'recovered', success: true }),
    });

    health = await (await testApp().request('/health', {}, env)).json<HealthResponse>();
    expect(health.status).toBe('healthy');

    rssXml = await (await testApp().request(`/rss/${feed.rssToken}.xml`, {}, env)).text();
    expect(rssXml).toContain('稼働回復');
    expect(rssXml.split('<item>').length - 1).toBe(2);
  });
});
