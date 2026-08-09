import { expect, test } from '@playwright/test';
import { loadFixtureWithBundle } from './support.js';

declare global {
  interface Window {
    SelectorEngine: typeof import('../src/index.js');
    __navigator: InstanceType<typeof import('../src/index.js').SelectionNavigator>;
  }
}

test.beforeEach(async ({ page }) => {
  await loadFixtureWithBundle(page, '/static.html');
});

test('moves to the parent element', async ({ page }) => {
  const parentTag = await page.evaluate(() => {
    const el = document.querySelector('#item-list .item')!;
    const nav = new window.SelectorEngine.SelectionNavigator(el);
    return nav.toParent()?.id;
  });
  expect(parentTag).toBe('item-list');
});

test('ArrowDown returns to the child that ArrowUp came from', async ({ page }) => {
  const result = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#item-list .item'));
    const second = items[1] as Element;
    const nav = new window.SelectorEngine.SelectionNavigator(second);
    nav.toParent();
    const backToChild = nav.toChild();
    return backToChild === second;
  });
  expect(result).toBe(true);
});

test('navigates to previous and next siblings among list items', async ({ page }) => {
  const texts = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#item-list .item'));
    const second = items[1] as Element;
    const nav = new window.SelectorEngine.SelectionNavigator(second);
    const next = nav.toNextSibling();
    const backToSecond = nav.toPreviousSibling();
    const prev = nav.toPreviousSibling();
    return {
      next: next?.textContent,
      backToSecond: backToSecond?.textContent,
      prev: prev?.textContent,
    };
  });
  expect(texts.next).toBe('項目C');
  expect(texts.backToSecond).toBe('項目B');
  expect(texts.prev).toBe('項目A');
});

test('returns null when there is no parent, sibling, or child to move to', async ({ page }) => {
  const result = await page.evaluate(() => {
    const html = document.documentElement;
    const nav = new window.SelectorEngine.SelectionNavigator(html);
    return {
      parent: nav.toParent(),
      prevSibling: nav.toPreviousSibling(),
    };
  });
  expect(result.parent).toBeNull();
  expect(result.prevSibling).toBeNull();
});
