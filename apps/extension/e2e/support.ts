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
export interface ChromeStubOptions {
  /** Canned GET_MONITOR response, for edit-mode bootstrap tests. */
  getMonitorResponse?: unknown;
}

export async function installChromeStub(
  page: Page,
  options: ChromeStubOptions = {},
): Promise<void> {
  await page.evaluate((opts) => {
    const sentMessages: unknown[] = [];
    (window as unknown as { __sentMessages: unknown[] }).__sentMessages = sentMessages;

    const sessionStorage = new Map<string, unknown>();

    (window as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: async (message: { type: string; payload?: unknown; monitorId?: string }) => {
          sentMessages.push(message);
          if (message.type === 'CREATE_MONITOR') {
            (window as unknown as { __lastCreatePayload: unknown }).__lastCreatePayload =
              message.payload;
            return { ok: true, data: { id: 'monitor-1' } };
          }
          if (message.type === 'UPDATE_MONITOR') {
            (window as unknown as { __lastUpdateMessage: unknown }).__lastUpdateMessage = message;
            return { ok: true, data: { id: message.monitorId } };
          }
          if (message.type === 'GET_MONITOR' && opts.getMonitorResponse) {
            return { ok: true, data: opts.getMonitorResponse };
          }
          return { ok: false, error: 'unhandled message in test stub' };
        },
      },
      storage: {
        session: {
          get: async (key: string) => ({ [key]: sessionStorage.get(key) }),
          set: async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) sessionStorage.set(key, value);
          },
          remove: async (key: string) => {
            sessionStorage.delete(key);
          },
        },
      },
    };
  }, options);
}

export async function loadFixtureWithContentScript(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await installChromeStub(page);
  await page.addScriptTag({ path: contentScriptPath });
  await page.waitForTimeout(50);
}

/**
 * Loads a fixture page with a pending edit already stashed in
 * chrome.storage.session (mirroring what popup.ts's editMonitor() does
 * before injecting), so the freshly-injected content script boots straight
 * into edit mode against the given canned Monitor instead of create mode.
 */
export async function loadFixtureForEdit(
  page: Page,
  path: string,
  monitor: { id: string },
): Promise<void> {
  await page.goto(path);
  await installChromeStub(page, { getMonitorResponse: monitor });
  await page.evaluate((monitorId) => {
    const chromeGlobal = (
      window as unknown as {
        chrome: {
          storage: { session: { set: (items: Record<string, unknown>) => Promise<void> } };
        };
      }
    ).chrome;
    return chromeGlobal.storage.session.set({ editingMonitorId: monitorId });
  }, monitor.id);
  await page.addScriptTag({ path: contentScriptPath });
  await page.waitForTimeout(50);
}
