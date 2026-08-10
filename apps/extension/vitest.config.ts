import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@web-monitor/extension',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
