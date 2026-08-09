import type { Env } from './env.js';
import { createApp } from './app.js';
import { runWatchdogCron } from './watchdog/check.js';
import { purgeOldChecks } from './db/repositories/checks.js';
import { purgeExpiredSessions } from './db/repositories/admin-sessions.js';
import { nowIso } from './lib/time.js';

const app = createApp();

export default {
  fetch: app.fetch,

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const now = nowIso();
    await runWatchdogCron(env.DB, now);
    await purgeOldChecks(env.DB, now);
    await purgeExpiredSessions(env.DB, now);
  },
};
