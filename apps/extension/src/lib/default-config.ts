import type { ExtensionConfig } from './storage.js';

/**
 * Empty by design: the repository is public, so no real API base URL or
 * Extension API token is committed here. On a fresh install, visit the
 * options page and enter both values once — they are then stored in
 * chrome.storage.local and take precedence over this default.
 */
export const DEFAULT_CONFIG: ExtensionConfig = {
  apiBaseUrl: '',
  extensionToken: '',
};
