// Per §8.2: default per-page timeout, shared by the Playwright Runner and
// the Chrome extension's local (background-tab) check so both time out
// identically.
export const PAGE_TIMEOUT_MS = 45_000;
