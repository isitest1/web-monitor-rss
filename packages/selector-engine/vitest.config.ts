import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@web-monitor/selector-engine',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
