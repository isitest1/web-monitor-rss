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
    // No incoming request in a cron trigger, so there is no real Origin to
    // read; the Worker's own deployed URL doubles as the canonical origin
    // for any RSS URL the watchdog might need to build (e.g. bootstrapping
    // the system feed on its very first alert).
    await runWatchdogCron(env.DB, env.ADMIN_ALLOWED_ORIGIN, now);
    await purgeOldChecks(env.DB, now);
    await purgeExpiredSessions(env.DB, now);
  },
};
