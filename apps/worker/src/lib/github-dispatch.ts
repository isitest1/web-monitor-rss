import type { Env } from '../env.js';

export interface GithubDispatchConfig {
  token: string;
  owner: string;
  repo: string;
  workflowFile: string;
  ref: string;
}

// All four pieces are optional Worker config: a personal deployment may run
// without wiring this up at all, in which case a newly created Monitor
// simply waits for the next scheduled/manual run, same as before.
export function getGithubDispatchConfig(env: Env): GithubDispatchConfig | null {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPO_OWNER || !env.GITHUB_REPO_NAME) return null;
  return {
    token: env.GITHUB_DISPATCH_TOKEN,
    owner: env.GITHUB_REPO_OWNER,
    repo: env.GITHUB_REPO_NAME,
    workflowFile: env.GITHUB_WORKFLOW_FILE || 'daily-monitor.yml',
    ref: env.GITHUB_REPO_REF || 'main',
  };
}

// Asks GitHub Actions to run the daily-monitor workflow immediately, scoped
// to a single Monitor via its existing `monitor_id` workflow_dispatch input
// (§15.2), so a freshly created Monitor gets its baseline check without
// waiting for the next scheduled run.
export async function triggerMonitorCheck(
  config: GithubDispatchConfig,
  monitorId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${config.workflowFile}/dispatches`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'web-monitor-rss-worker',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ref: config.ref, inputs: { monitor_id: monitorId } }),
  });
  if (!res.ok) {
    throw new Error(`github workflow dispatch failed with status ${res.status}`);
  }
}
