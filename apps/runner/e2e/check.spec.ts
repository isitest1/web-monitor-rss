import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { test, expect } from '@playwright/test';
import { DEFAULT_NORMALIZATION_CONFIG, type MonitorWithSelections } from '@web-monitor/shared';
import { checkMonitor } from '../src/check.js';

function buildMonitor(url: string, selector: string): MonitorWithSelections {
  return {
    id: 'monitor-1',
    feedId: 'feed-1',
    name: 'テスト監視',
    url,
    monitorMode: 'single',
    comparisonRule: 'normalized_equality',
    executionMode: 'server',
    checkIntervalSec: 86400,
    enabled: true,
    orderIndex: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    selections: [
      {
        id: 'selection-1',
        monitorId: 'monitor-1',
        label: '見出し',
        selectorType: 'css',
        selector,
        selectorCandidates: [],
        extractionMode: 'text',
        attributeName: null,
        normalization: DEFAULT_NORMALIZATION_CONFIG,
        matchMode: 'normalized',
        orderIndex: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  };
}

test.describe('checkMonitor', () => {
  test.afterEach(async () => {
    await rm(new URL('../traces', import.meta.url), { recursive: true, force: true }).catch(
      () => undefined,
    );
  });

  test('returns SUCCESS with extracted values and no trace on success', async ({ baseURL }) => {
    const browser = await chromium.launch();
    try {
      const monitor = buildMonitor(`${baseURL}/static.html`, '#headline');
      const outcome = await checkMonitor(browser, monitor, 'run-success');
      expect(outcome.status).toBe('SUCCESS');
      expect(outcome.values[0]?.displayValue).toBe('初期の見出しです');
      expect(outcome.tracePath).toBeNull();
    } finally {
      await browser.close();
    }
  });

  test('returns SELECTOR_NOT_FOUND and saves a trace file on failure', async ({ baseURL }) => {
    const browser = await chromium.launch();
    try {
      const monitor = buildMonitor(`${baseURL}/static.html`, '#does-not-exist');
      const outcome = await checkMonitor(browser, monitor, 'run-failure');
      expect(outcome.status).toBe('SELECTOR_NOT_FOUND');
      expect(outcome.tracePath).toBeTruthy();
      expect(existsSync(outcome.tracePath!)).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
