import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { fetchMonitors, sendHeartbeat, submitResult } from './api-client.js';
import { checkMonitor } from './check.js';
import type { RunnerConfig } from './env.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyRandomDelay(config: RunnerConfig): Promise<void> {
  if (config.randomDelayMaxMinutes <= 0) return;
  const delayMs = Math.random() * config.randomDelayMaxMinutes * 60_000;
  console.log(`waiting ${Math.round(delayMs / 1000)}s of random start delay`);
  await sleep(delayMs);
}

export async function runDailyCheck(config: RunnerConfig): Promise<void> {
  const runId = randomUUID();
  let succeeded = false;

  await sendHeartbeat(config, { event: 'start', runId });

  try {
    await applyRandomDelay(config);
    const monitors = await fetchMonitors(config);
    console.log(`fetched ${monitors.length} monitor(s) to check`);

    const browser = await chromium.launch();
    try {
      for (const monitor of monitors) {
        const outcome = await checkMonitor(browser, monitor);
        // Never log extracted content, only metadata.
        console.log(
          `monitor=${monitor.id} name="${monitor.name}" status=${outcome.status} durationMs=${outcome.durationMs}`,
        );
        const result = await submitResult(config, {
          monitorId: monitor.id,
          runId,
          startedAt: new Date(Date.now() - outcome.durationMs).toISOString(),
          finishedAt: new Date().toISOString(),
          status: outcome.status,
          durationMs: outcome.durationMs,
          httpStatus: outcome.httpStatus,
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage,
          values: outcome.values,
        });
        console.log(`monitor=${monitor.id} result=${result.status}`);
      }
    } finally {
      await browser.close();
    }

    succeeded = true;
  } finally {
    await sendHeartbeat(config, { event: 'complete', runId, success: succeeded });
  }
}
