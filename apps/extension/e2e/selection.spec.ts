import { expect, test } from '@playwright/test';
import { contentScriptPath, installChromeStub, loadFixtureWithContentScript } from './support.js';

test.describe('Visual Selector overlay on the static fixture page', () => {
  test.beforeEach(async ({ page }) => {
    await loadFixtureWithContentScript(page, '/static.html');
  });

  test('renders the panel and loads the available feed', async ({ page }) => {
    await expect(page.locator('.panel h2')).toHaveText('Web Monitor RSS - 選択');
    await expect(page.locator('.panel select option')).toContainText(['テストFeed']);
  });

  test('shows a hover box over the element under the cursor', async ({ page }) => {
    const headline = page.locator('#headline');
    const box = await headline.boundingBox();
    if (!box) throw new Error('headline has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const hoverBox = page.locator('.hover-box');
    await expect(hoverBox).toHaveCSS('display', 'block');
    const hoverStyle = await hoverBox.evaluate((el) => ({
      left: parseFloat((el as HTMLElement).style.left),
      top: parseFloat((el as HTMLElement).style.top),
    }));
    expect(Math.abs(hoverStyle.left - box.x)).toBeLessThan(2);
    expect(Math.abs(hoverStyle.top - box.y)).toBeLessThan(2);
  });

  test('clicking an element adds exactly one selection', async ({ page }) => {
    await page.locator('#headline').click();
    await expect(page.locator('.panel li')).toHaveCount(1);
    await expect(page.locator('.selected-box')).toHaveCount(1);
  });

  test('supports adding multiple labeled selections', async ({ page }) => {
    await page.locator('#headline').click();
    await page.locator('[data-testid="price"]').click();
    await expect(page.locator('.panel li')).toHaveCount(2);
    await expect(page.locator('.selected-box')).toHaveCount(2);
  });

  test('removes a selection via its delete button', async ({ page }) => {
    await page.locator('#headline').click();
    await page.locator('[data-testid="price"]').click();
    await expect(page.locator('.panel li')).toHaveCount(2);

    await page.locator('.panel li .delete-btn').first().click();
    await expect(page.locator('.panel li')).toHaveCount(1);
    await expect(page.locator('.selected-box')).toHaveCount(1);
  });

  test('Escape exits selection mode and removes the overlay entirely', async ({ page }) => {
    await page.locator('#headline').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#web-monitor-overlay-root')).toHaveCount(0);
  });

  test('adds a full-page selection distinct from element selections', async ({ page }) => {
    await page.locator('.panel .fullpage-btn').click();
    await expect(page.locator('.panel li')).toHaveCount(1);
  });

  test('list mode picks the repeating-structure selector and defaults to list extraction', async ({
    page,
  }) => {
    await page.locator('.panel select').nth(1).selectOption('list');
    await page.locator('#item-list .item').first().click();

    await expect(page.locator('.panel li select')).toHaveValue('list');
    await expect(page.locator('.panel li .preview')).toContainText('3件に一致');
    await expect(page.locator('.panel li .preview')).toContainText('項目A');
    await expect(page.locator('.panel li .preview')).toContainText('項目C');
  });

  test('ArrowUp moves the hover candidate to the parent element', async ({ page }) => {
    const item = page.locator('#item-list .item').first();
    const itemBox = await item.boundingBox();
    if (!itemBox) throw new Error('item has no bounding box');
    await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);

    await page.keyboard.press('ArrowUp');

    const parentBox = await page.locator('#item-list').boundingBox();
    if (!parentBox) throw new Error('parent has no bounding box');
    const hoverStyle = await page.locator('.hover-box').evaluate((el) => ({
      left: parseFloat((el as HTMLElement).style.left),
      top: parseFloat((el as HTMLElement).style.top),
    }));
    expect(Math.abs(hoverStyle.left - parentBox.x)).toBeLessThan(2);
    expect(Math.abs(hoverStyle.top - parentBox.y)).toBeLessThan(2);
  });

  test('ArrowDown returns to the child that ArrowUp came from', async ({ page }) => {
    const item = page.locator('#item-list .item').nth(1);
    const itemBox = await item.boundingBox();
    if (!itemBox) throw new Error('item has no bounding box');
    await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    const label = await page.locator('.panel li .preview').first().textContent();
    expect(label).toContain('項目B');
  });

  test('saves the monitor with the confirmed selections through the extension message boundary', async ({
    page,
  }) => {
    await page.locator('#headline').click();
    await page.locator('.panel input[type="text"]').first().fill('見出し監視');
    await page.locator('.panel .save-btn').click();

    await expect(page.locator('.panel .status')).toHaveText('保存しました。');

    const payload = await page.evaluate(
      () =>
        (window as unknown as { __lastCreatePayload: Record<string, unknown> }).__lastCreatePayload,
    );
    expect(payload).toMatchObject({
      name: '見出し監視',
      feedId: 'feed-1',
      monitorMode: 'single',
    });
    const selections = payload!.selections as Array<{ label: string; selector: string }>;
    expect(selections).toHaveLength(1);
    expect(selections[0]!.selector).toBe('#headline');

    await expect(page.locator('#web-monitor-overlay-root')).toHaveCount(0, { timeout: 2000 });
  });
});

test.describe('Visual Selector overlay on the dynamic fixture page', () => {
  test('selects a client-rendered element once it appears', async ({ page }) => {
    await page.goto('/dynamic.html');
    await page.waitForSelector('#headline');
    await installChromeStub(page);
    await page.addScriptTag({ path: contentScriptPath });
    await page.waitForTimeout(50);

    await page.locator('#headline').click();
    await expect(page.locator('.panel li')).toHaveCount(1);
    const preview = await page.locator('.panel li .preview').first().textContent();
    expect(preview).toContain('動的に生成された見出しです');
  });
});
