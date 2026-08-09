export interface ExtensionConfig {
  apiBaseUrl: string;
  extensionToken: string;
}

const STORAGE_KEY = 'webMonitorConfig';

export async function getConfig(): Promise<ExtensionConfig | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as ExtensionConfig | undefined;
  if (!value || !value.apiBaseUrl || !value.extensionToken) return null;
  return value;
}

export async function setConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}
