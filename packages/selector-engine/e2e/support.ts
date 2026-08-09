import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export const bundlePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '.tmp',
  'selector-engine.bundle.js',
);

export async function loadFixtureWithBundle(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.addScriptTag({ path: bundlePath });
}
