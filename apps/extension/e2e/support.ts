import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export const contentScriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'content-script.js',
);

/**
 * Stubs the `chrome` global that the extension normally gets from the
 * browser runtime, so the real content-script bundle can be injected into
 * an ordinary Playwright page (no --load-extension dance) while its Worker
 * API calls resolve to canned data. DOM/selector/keyboard behavior under
 * test is entirely real; only the extension-message boundary is mocked.
 */
export async function installChromeStub(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sentMessages: unknown[] = [];
    (window as unknown as { __sentMessages: unknown[] }).__sentMessages = sentMessages;

    (window as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: async (message: { type: string; payload?: unknown }) => {
          sentMessages.push(message);
          if (message.type === 'LIST_FEEDS') {
            return {
              ok: true,
              data: {
                feeds: [
                  {
                    id: 'feed-1',
                    name: 'テストFeed',
                    slug: 'test-feed',
                    kind: 'content',
                    enabled: true,
                    rssTokenPrefix: null,
                    rssTokenIssuedAt: null,
                    rssTokenLastUsedAt: null,
                    rssTokenStatus: null,
                    createdAt: '2025-01-01T00:00:00.000Z',
                    updatedAt: '2025-01-01T00:00:00.000Z',
                  },
                ],
              },
            };
          }
          if (message.type === 'CREATE_MONITOR') {
            (window as unknown as { __lastCreatePayload: unknown }).__lastCreatePayload =
              message.payload;
            return { ok: true, data: { id: 'monitor-1' } };
          }
          return { ok: false, error: 'unhandled message in test stub' };
        },
      },
    };
  });
}

export async function loadFixtureWithContentScript(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await installChromeStub(page);
  await page.addScriptTag({ path: contentScriptPath });
  // The panel renders synchronously; the LIST_FEEDS round trip resolves on
  // a microtask shortly after.
  await page.waitForTimeout(50);
}
