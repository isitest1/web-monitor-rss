import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@web-monitor/runner',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
