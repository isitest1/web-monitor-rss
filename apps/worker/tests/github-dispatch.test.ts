import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonitorWithSelections } from '@web-monitor/shared';
import { testApp } from './test-app.js';
import { loginAsAdmin } from './support.js';
import {
  getGithubDispatchConfig,
  triggerMonitorCheck,
  type GithubDispatchConfig,
} from '../src/lib/github-dispatch.js';

describe('getGithubDispatchConfig', () => {
  it('returns null when the token or repo is not configured', () => {
    expect(getGithubDispatchConfig({ ...env })).toBeNull();
  });

  it('fills in default workflow file and ref when only the required fields are set', () => {
    const config = getGithubDispatchConfig({
      ...env,
      GITHUB_DISPATCH_TOKEN: 'gh-token',
      GITHUB_REPO_OWNER: 'acme',
      GITHUB_REPO_NAME: 'repo',
    });
    expect(config).toEqual({
      token: 'gh-token',
      owner: 'acme',
      repo: 'repo',
      workflowFile: 'daily-monitor.yml',
      ref: 'main',
    });
  });
});

describe('triggerMonitorCheck', () => {
  const config: GithubDispatchConfig = {
    token: 'gh-token',
    owner: 'acme',
    repo: 'repo',
    workflowFile: 'daily-monitor.yml',
    ref: 'main',
  };

  it('posts a workflow_dispatch request scoped to the given monitor id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await triggerMonitorCheck(config, 'monitor-123', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/acme/repo/actions/workflows/daily-monitor.yml/dispatches',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      ref: 'main',
      inputs: { monitor_id: 'monitor-123' },
    });
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer gh-token');
  });

  it('throws when GitHub responds with a non-2xx status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(triggerMonitorCheck(config, 'monitor-123', fetchImpl)).rejects.toThrow(/404/);
  });
});

describe('immediate baseline check on Monitor creation', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM checks');
    await env.DB.exec('DELETE FROM changes');
    await env.DB.exec('DELETE FROM monitor_state');
    await env.DB.exec('DELETE FROM selections');
    await env.DB.exec('DELETE FROM monitors');
    await env.DB.exec('DELETE FROM feeds');
    await env.DB.exec('DELETE FROM admin_sessions');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches a scoped workflow run when GITHUB_DISPATCH_TOKEN is configured', async () => {
    const admin = await loginAsAdmin(env);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const dispatchEnv = {
      ...env,
      GITHUB_DISPATCH_TOKEN: 'gh-token',
      GITHUB_REPO_OWNER: 'acme',
      GITHUB_REPO_NAME: 'repo',
    };
    const ctx = createExecutionContext();
    const res = await testApp().request(
      '/api/monitors',
      {
        method: 'POST',
        headers: {
          cookie: admin.cookie,
          'content-type': 'application/json',
          'x-csrf-token': admin.csrfToken,
        },
        body: JSON.stringify({
          name: 'Dispatch Monitor',
          url: 'https://example.com/dispatch',
          selections: [
            { label: '値', selectorType: 'css', selector: '#v', extractionMode: 'text' },
          ],
        }),
      },
      dispatchEnv,
      ctx,
    );
    expect(res.status).toBe(201);
    const monitor = await res.json<MonitorWithSelections>();
    await waitOnExecutionContext(ctx);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/acme/repo/actions/workflows/daily-monitor.yml/dispatches',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      ref: 'main',
      inputs: { monitor_id: monitor.id },
    });
  });

  it('does not attempt a dispatch when GITHUB_DISPATCH_TOKEN is not configured', async () => {
    const admin = await loginAsAdmin(env);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const ctx = createExecutionContext();
    const res = await testApp().request(
      '/api/monitors',
      {
        method: 'POST',
        headers: {
          cookie: admin.cookie,
          'content-type': 'application/json',
          'x-csrf-token': admin.csrfToken,
        },
        body: JSON.stringify({
          name: 'No Dispatch Monitor',
          url: 'https://example.com/no-dispatch',
          selections: [
            { label: '値', selectorType: 'css', selector: '#v', extractionMode: 'text' },
          ],
        }),
      },
      env,
      ctx,
    );
    expect(res.status).toBe(201);
    await waitOnExecutionContext(ctx);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
