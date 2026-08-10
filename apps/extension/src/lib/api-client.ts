import type {
  CreateMonitorRequest,
  Feed,
  Monitor,
  MonitorWithSelections,
  RunnerResultRequest,
  RunnerResultResponse,
  UpdateMonitorRequest,
} from '@web-monitor/shared';
import type { ExtensionConfig } from './storage.js';

async function apiFetch(
  config: ExtensionConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${config.extensionToken}`);
  if (init.body) headers.set('content-type', 'application/json');
  const res = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API request failed: ${init.method ?? 'GET'} ${path} -> ${res.status} ${body}`);
  }
  return res;
}

export async function listFeeds(config: ExtensionConfig): Promise<Feed[]> {
  const res = await apiFetch(config, '/api/feeds');
  const body = (await res.json()) as { feeds: Feed[] };
  return body.feeds;
}

export async function listMonitors(config: ExtensionConfig): Promise<MonitorWithSelections[]> {
  const res = await apiFetch(config, '/api/monitors');
  const body = (await res.json()) as { monitors: MonitorWithSelections[] };
  return body.monitors;
}

export async function getMonitor(
  config: ExtensionConfig,
  monitorId: string,
): Promise<MonitorWithSelections> {
  const res = await apiFetch(config, `/api/monitors/${monitorId}`);
  return (await res.json()) as MonitorWithSelections;
}

export async function createMonitor(
  config: ExtensionConfig,
  payload: CreateMonitorRequest,
): Promise<MonitorWithSelections> {
  const res = await apiFetch(config, '/api/monitors', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return (await res.json()) as MonitorWithSelections;
}

export async function updateMonitor(
  config: ExtensionConfig,
  monitorId: string,
  payload: UpdateMonitorRequest,
): Promise<MonitorWithSelections> {
  const res = await apiFetch(config, `/api/monitors/${monitorId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return (await res.json()) as MonitorWithSelections;
}

export async function setMonitorEnabled(
  config: ExtensionConfig,
  monitorId: string,
  enabled: boolean,
): Promise<Monitor> {
  const res = await apiFetch(
    config,
    `/api/monitors/${monitorId}/${enabled ? 'enable' : 'disable'}`,
    {
      method: 'POST',
    },
  );
  return (await res.json()) as Monitor;
}

export async function pingApi(config: ExtensionConfig): Promise<void> {
  await apiFetch(config, '/api/feeds');
}

// Local (execution_mode 'local') counterparts of the Runner's own
// /api/runner/monitors and /api/runner/results — same shapes, but
// authenticated with the Extension token and scoped to Monitors due for a
// background-tab check right now (§4.1/§10).
export async function listDueLocalMonitors(
  config: ExtensionConfig,
): Promise<MonitorWithSelections[]> {
  const res = await apiFetch(config, '/api/extension/monitors');
  const body = (await res.json()) as { monitors: MonitorWithSelections[] };
  return body.monitors;
}

export async function submitExtensionResult(
  config: ExtensionConfig,
  payload: RunnerResultRequest,
): Promise<RunnerResultResponse> {
  const res = await apiFetch(config, '/api/extension/results', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return (await res.json()) as RunnerResultResponse;
}
