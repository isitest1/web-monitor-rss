import { defineConfig } from '@playwright/test';

const E2E_TEST_VARS = [
  'ADMIN_LOGIN_SECRET:e2e-admin-secret',
  'EXTENSION_API_TOKEN:e2e-extension-token',
  'RUNNER_API_TOKEN:e2e-runner-token',
  'SESSION_SIGNING_SECRET:e2e-session-secret',
  // Lets full-flow.spec.ts point Monitors at the local fixture server;
  // never set outside this local test config.
  'ALLOW_PRIVATE_MONITOR_URLS:true',
]
  .map((v) => `--var ${v}`)
  .join(' ');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  webServer: [
    {
      command: 'pnpm --filter @web-monitor/test-fixtures run dev',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Full-flow.spec.ts exercises the real Worker (D1 change detection,
      // RSS generation) over HTTP, not just the fixture pages, so it needs
      // an actual local Worker instance rather than an in-process mock.
      command:
        `pnpm --filter @web-monitor/worker exec wrangler d1 migrations apply web-monitor-rss --local --persist-to .wrangler-e2e-state && ` +
        `pnpm --filter @web-monitor/worker exec wrangler dev --port 8787 --local --persist-to .wrangler-e2e-state ${E2E_TEST_VARS}`,
      url: 'http://localhost:8787/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  use: {
    baseURL: 'http://localhost:4173',
  },
});
