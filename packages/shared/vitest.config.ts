import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@web-monitor/shared',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
