import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, 'migrations');
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          compatibilityFlags: ['nodejs_compat'],
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_LOGIN_SECRET: 'test-admin-secret',
            EXTENSION_API_TOKEN: 'test-extension-token',
            RUNNER_API_TOKEN: 'test-runner-token',
            SESSION_SIGNING_SECRET: 'test-session-signing-secret',
            ADMIN_SESSION_TTL_SEC: '3600',
            DEFAULT_HEARTBEAT_THRESHOLD_SEC: '93600',
            ADMIN_ALLOWED_ORIGIN: 'http://localhost:8787',
            EXTENSION_ALLOWED_ORIGIN: 'chrome-extension://test',
          },
        },
      }),
    ],
    test: {
      name: '@web-monitor/worker',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['./tests/apply-migrations.ts'],
    },
  };
});
