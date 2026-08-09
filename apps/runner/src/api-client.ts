import {
  heartbeatRequestSchema,
  runnerMonitorListResponseSchema,
  runnerResultRequestSchema,
  runnerResultResponseSchema,
  type HeartbeatRequest,
  type MonitorWithSelections,
  type RunnerResultRequest,
  type RunnerResultResponse,
} from '@web-monitor/shared';
import type { RunnerConfig } from './env.js';

async function apiFetch(
  config: RunnerConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${config.runnerApiToken}`);
  if (init.body) headers.set('content-type', 'application/json');
  const res = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Worker API request failed: ${init.method ?? 'GET'} ${path} -> ${res.status} ${body}`,
    );
  }
  return res;
}

export async function fetchMonitors(config: RunnerConfig): Promise<MonitorWithSelections[]> {
  const res = await apiFetch(config, '/api/runner/monitors');
  const parsed = runnerMonitorListResponseSchema.parse(await res.json());
  if (config.monitorId) {
    return parsed.monitors.filter((m) => m.id === config.monitorId);
  }
  return parsed.monitors;
}

export async function submitResult(
  config: RunnerConfig,
  payload: RunnerResultRequest,
): Promise<RunnerResultResponse> {
  const validated = runnerResultRequestSchema.parse(payload);
  const res = await apiFetch(config, '/api/runner/results', {
    method: 'POST',
    body: JSON.stringify(validated),
  });
  return runnerResultResponseSchema.parse(await res.json());
}

export async function sendHeartbeat(
  config: RunnerConfig,
  payload: HeartbeatRequest,
): Promise<void> {
  const validated = heartbeatRequestSchema.parse(payload);
  await apiFetch(config, '/api/runner/heartbeat', {
    method: 'POST',
    body: JSON.stringify(validated),
  });
}
