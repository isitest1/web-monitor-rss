import { expect, test } from '@playwright/test';
import { loadFixtureWithBundle } from './support.js';

declare global {
  interface Window {
    SelectorEngine: typeof import('../src/index.js');
  }
}

test.beforeEach(async ({ page }) => {
  await loadFixtureWithBundle(page, '/static.html');
});

test('single mode picks a uniquely matching candidate', async ({ page }) => {
  const picked = await page.evaluate(() => {
    const el = document.getElementById('headline')!;
    const candidates = window.SelectorEngine.generateSelectorCandidates(el);
    return window.SelectorEngine.pickBestCandidate(candidates, 'single');
  });
  expect(picked).toMatchObject({ selector: '#headline', matchCount: 1 });
});

test('list mode picks the candidate representing the repeating structure', async ({ page }) => {
  const picked = await page.evaluate(() => {
    const el = document.querySelector('#item-list .item')!;
    const candidates = window.SelectorEngine.generateSelectorCandidates(el);
    return window.SelectorEngine.pickBestCandidate(candidates, 'list');
  });
  expect(picked?.matchCount).toBeGreaterThan(1);
});
