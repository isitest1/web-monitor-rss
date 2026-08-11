import { expect, test } from '@playwright/test';
import { loadFixtureForEdit } from './support.js';

const NORMALIZATION = {
  extractFirstNumber: false,
  parsePrice: false,
  removeStrings: [],
  caseInsensitive: false,
};

const EDIT_MONITOR = {
  id: 'edit-monitor-1',
  feedId: 'feed-1',
  name: '既存の監視',
  url: 'http://localhost:4173/static.html',
  monitorMode: 'single',
  comparisonRule: 'normalized_equality',
  executionMode: 'server',
  checkIntervalSec: 86400,
  groupName: null,
  enabled: true,
  orderIndex: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  selections: [
    {
      id: 'sel-headline',
      monitorId: 'edit-monitor-1',
      label: '見出し',
      selectorType: 'css',
      selector: '#headline',
      selectorCandidates: [],
      extractionMode: 'text',
      attributeName: null,
      normalization: NORMALIZATION,
      matchMode: 'normalized',
      orderIndex: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'sel-missing',
      monitorId: 'edit-monitor-1',
      label: '消えた項目',
      selectorType: 'css',
      selector: '#does-not-exist-anymore',
      selectorCandidates: [],
      extractionMode: 'text',
      attributeName: null,
      normalization: NORMALIZATION,
      matchMode: 'normalized',
      orderIndex: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
};

test.describe('editing an existing Monitor', () => {
  test.beforeEach(async ({ page }) => {
    await loadFixtureForEdit(page, '/static.html', EDIT_MONITOR);
  });

  test('boots into edit mode with the saved selections pre-populated', async ({ page }) => {
    await expect(page.locator('.panel h2')).toHaveText('Web Monitor RSS - Monitorを編集中');
    await expect(page.locator('.panel li')).toHaveCount(2);
    await expect(page.locator('.panel input[type="text"]').first()).toHaveValue('既存の監視');
  });

  test('shows a resolved selection normally and an unresolved one with a warning', async ({
    page,
  }) => {
    const items = page.locator('.panel li');
    await expect(items.filter({ hasText: '見出し' })).not.toHaveClass(/unresolved/);
    const missingItem = items.filter({ has: page.locator('.unresolved-warning') });
    await expect(missingItem).toHaveCount(1);
    await expect(missingItem.locator('.unresolved-warning')).toContainText('見つかりません');
  });

  test('re-selecting an unresolved item replaces it with a clicked element', async ({ page }) => {
    const missingItem = page
      .locator('.panel li')
      .filter({ has: page.locator('.unresolved-warning') });
    await missingItem.locator('.reselect-btn').click();
    await expect(page.locator('.panel .hint')).toContainText('クリックしてください');

    await page.locator('#product-link').click();

    await expect(page.locator('.panel li.unresolved')).toHaveCount(0);
    // Selection order is preserved (見出し, 消えた項目), and the label lives
    // in an <input> *property*, not an HTML attribute or text content, so
    // neither hasText nor an [value=...] CSS selector can find it — index
    // into the list instead.
    const preview = await page.locator('.panel li').nth(1).locator('.preview').textContent();
    expect(preview).toContain('商品ページへ');
  });

  test('save sends UPDATE_MONITOR preserving the resolved Selection id', async ({ page }) => {
    // Fix the unresolved selection first so save() is not blocked by it.
    const missingItem = page
      .locator('.panel li')
      .filter({ has: page.locator('.unresolved-warning') });
    await missingItem.locator('.reselect-btn').click();
    await page.locator('#product-link').click();

    await page.locator('.panel .save-btn').click();
    await expect(page.locator('.panel .status')).toHaveText('保存しました。');

    const message = await page.evaluate(
      () =>
        (window as unknown as { __lastUpdateMessage: Record<string, unknown> }).__lastUpdateMessage,
    );
    expect(message).toMatchObject({ type: 'UPDATE_MONITOR', monitorId: 'edit-monitor-1' });
    const payload = message!.payload as { selections: Array<{ id?: string; label: string }> };
    const headline = payload.selections.find((s) => s.label === '見出し');
    expect(headline?.id).toBe('sel-headline');
  });

  test('blocks save while an unresolved selection remains', async ({ page }) => {
    await page.locator('.panel .save-btn').click();
    await expect(page.locator('.panel .status')).toContainText('見つからない選択があります');

    const message = await page.evaluate(
      () => (window as unknown as { __lastUpdateMessage?: unknown }).__lastUpdateMessage,
    );
    expect(message).toBeUndefined();
  });
});
