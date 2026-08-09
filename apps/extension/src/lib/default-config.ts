import type { ExtensionConfig } from './storage.js';

/**
 * Baked-in default connection settings for this single-user personal
 * deployment, so a fresh install on a new computer works immediately
 * without visiting the options page. The options page can still override
 * these (e.g. after rotating the Extension API token) — a saved value in
 * chrome.storage.local always takes precedence over this default.
 *
 * The Extension API token is a real credential and living here means it
 * is committed to the (private) repository; this trade-off was chosen
 * deliberately for personal-use convenience over the alternative of
 * re-entering it on every machine.
 */
export const DEFAULT_CONFIG: ExtensionConfig = {
  apiBaseUrl: 'https://web-monitor-rss-worker.kouhei1.workers.dev',
  extensionToken: '001b62fe084115ab799dbe28de83e05629dcb8f2da3279555c7a0d51b6b5b6f5',
};
