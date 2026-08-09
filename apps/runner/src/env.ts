export interface RunnerConfig {
  apiBaseUrl: string;
  runnerApiToken: string;
  monitorId: string | null;
  randomDelayMaxMinutes: number;
}

export function loadRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const apiBaseUrl = env.MONITOR_API_BASE_URL;
  const runnerApiToken = env.RUNNER_API_TOKEN;
  if (!apiBaseUrl) throw new Error('MONITOR_API_BASE_URL is required');
  if (!runnerApiToken) throw new Error('RUNNER_API_TOKEN is required');

  const randomDelayMaxMinutes = Number(env.RANDOM_DELAY_MAX_MINUTES ?? '0');

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    runnerApiToken,
    monitorId: env.MONITOR_ID?.trim() || null,
    randomDelayMaxMinutes: Number.isFinite(randomDelayMaxMinutes) ? randomDelayMaxMinutes : 0,
  };
}
