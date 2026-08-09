import { DEFAULT_CONFIG } from './default-config.js';

export interface ExtensionConfig {
  apiBaseUrl: string;
  extensionToken: string;
}

const STORAGE_KEY = 'webMonitorConfig';

export async function getConfig(): Promise<ExtensionConfig | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as ExtensionConfig | undefined;
  if (value?.apiBaseUrl && value.extensionToken) return value;
  return DEFAULT_CONFIG;
}

export async function setConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}
