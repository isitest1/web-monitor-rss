import { expect, test } from '@playwright/test';
import { loadFixtureWithBundle } from './support.js';

declare global {
  interface Window {
    SelectorEngine: typeof import('../src/index.js');
  }
}

const DEFAULT_NORMALIZATION = {
  extractFirstNumber: false,
  parsePrice: false,
  removeStrings: [],
  caseInsensitive: false,
};

function baseSelection(overrides: Record<string, unknown>) {
  return {
    id: 'selection-1',
    monitorId: 'monitor-1',
    label: 'テスト項目',
    selectorType: 'css',
    selector: '',
    selectorCandidates: [],
    extractionMode: 'text',
    attributeName: null,
    normalization: DEFAULT_NORMALIZATION,
    matchMode: 'normalized',
    orderIndex: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  await loadFixtureWithBundle(page, '/static.html');
});

test('extracts normalized text from a unique selector', async ({ page }) => {
  const value = await page.evaluate(
    async (selection) => {
      return window.SelectorEngine.extractSelectionFromDom(selection as never);
    },
    baseSelection({ selector: '#headline', extractionMode: 'text' }),
  );
  expect(value.displayValue).toBe('初期の見出しです');
});

test('extracts an attribute value', async ({ page }) => {
  const value = await page.evaluate(
    async (selection) => {
      return window.SelectorEngine.extractSelectionFromDom(selection as never);
    },
    baseSelection({ selector: '[data-testid="price"]', extractionMode: 'text' }),
  );
  expect(value.displayValue).toBe('価格: ¥1,980');
});

test('captures absolute URLs of <img> descendants within a text-mode selection', async ({
  page,
}) => {
  const value = await page.evaluate(
    async (selection) => {
      return window.SelectorEngine.extractSelectionFromDom(selection as never);
    },
    baseSelection({ selector: '#product-card', extractionMode: 'text' }),
  );
  expect(value.displayValue).toBe('カード内の説明テキスト');
  expect(value.images).toEqual([
    'http://localhost:4173/images/card-1.jpg',
    'http://localhost:4173/images/card-2.jpg',
  ]);
  // Images are display-only and must never affect the comparison value.
  expect(value.comparisonValue).not.toContain('card-1.jpg');
});

test('does not attach images for a text-mode selection with none inside it', async ({ page }) => {
  const value = await page.evaluate(
    async (selection) => {
      return window.SelectorEngine.extractSelectionFromDom(selection as never);
    },
    baseSelection({ selector: '#headline', extractionMode: 'text' }),
  );
  expect(value.images).toBeUndefined();
});

test('resolves a link href to an absolute URL', async ({ page }) => {
  const value = await page.evaluate(
    async (selection) => {
      return window.SelectorEngine.extractSelectionFromDom(selection as never);
    },
    baseSelection({ selector: '#product-link', extractionMode: 'link' }),
  );
  expect(value.displayValue).toContain('/product');
  expect(String(value.displayValue)).toMatch(/^https?:\/\//);
});

test('resolves an image src to an absolute URL', async ({ page }) => {
  const value = await page.evaluate(
    async (selection) => {
      return window.SelectorEngine.extractSelectionFromDom(selection as never);
    },
    baseSelection({ selector: '#hero-image', extractionMode: 'image' }),
  );
  expect(String(value.displayValue)).toMatch(/\/images\/hero\.jpg$/);
});

test('extracts a repeating list in order', async ({ page }) => {
  const value = await page.evaluate(
    async (selection) => {
      return window.SelectorEngine.extractSelectionFromDom(selection as never);
    },
    baseSelection({ selector: '#item-list .item', extractionMode: 'list' }),
  );
  expect(value.displayValue).toEqual(['項目A', '項目B', '項目C']);
});

test('throws SELECTOR_NOT_FOUND when nothing matches', async ({ page }) => {
  const error = await page.evaluate(
    async (selection) => {
      try {
        await window.SelectorEngine.extractSelectionFromDom(selection as never);
        return null;
      } catch (err) {
        return { statusCode: (err as { statusCode: string }).statusCode };
      }
    },
    baseSelection({ selector: '#does-not-exist', extractionMode: 'text' }),
  );
  expect(error?.statusCode).toBe('SELECTOR_NOT_FOUND');
});

test('throws SELECTOR_NOT_UNIQUE when a single-mode selector matches multiple elements', async ({
  page,
}) => {
  const error = await page.evaluate(
    async (selection) => {
      try {
        await window.SelectorEngine.extractSelectionFromDom(selection as never);
        return null;
      } catch (err) {
        return { statusCode: (err as { statusCode: string }).statusCode };
      }
    },
    baseSelection({ selector: '#item-list .item', extractionMode: 'text' }),
  );
  expect(error?.statusCode).toBe('SELECTOR_NOT_UNIQUE');
});

test('waits for content that renders after a delay', async ({ page }) => {
  await loadFixtureWithBundle(page, '/dynamic.html');
  const value = await page.evaluate(
    async (selection) => {
      return window.SelectorEngine.extractSelectionFromDom(selection as never);
    },
    baseSelection({ selector: '#headline', extractionMode: 'text' }),
  );
  expect(value.displayValue).toBe('動的に生成された見出しです');
});
