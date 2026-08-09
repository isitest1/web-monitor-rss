import type { Browser, BrowserContext } from 'playwright';

export const DEFAULT_VIEWPORT = { width: 1440, height: 1000 };
export const DEFAULT_LOCALE = 'ja-JP';
export const DEFAULT_TIMEZONE = 'Asia/Tokyo';
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36 WebMonitorRSS/1.0';
export const PAGE_TIMEOUT_MS = 45_000;
export const MAX_RESPONSE_BYTES = 5_000_000;

export async function createMonitorContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: DEFAULT_VIEWPORT,
    locale: DEFAULT_LOCALE,
    timezoneId: DEFAULT_TIMEZONE,
    userAgent: DEFAULT_USER_AGENT,
  });
}
