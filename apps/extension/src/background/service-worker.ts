import type { ExtensionMessage, MessageResult } from '../lib/messages.js';
import { getConfig } from '../lib/storage.js';
import {
  createMonitor,
  getMonitor,
  listFeeds,
  listMonitors,
  pingApi,
  setMonitorEnabled,
  updateMonitor,
} from '../lib/api-client.js';

async function handleMessage(message: ExtensionMessage): Promise<MessageResult<unknown>> {
  const config = await getConfig();
  if (!config && message.type !== 'PING_API') {
    return {
      ok: false,
      error: 'Extension APIトークンが未設定です。オプション画面で設定してください。',
    };
  }

  try {
    switch (message.type) {
      case 'LIST_FEEDS':
        return { ok: true, data: { feeds: await listFeeds(config!) } };
      case 'LIST_MONITORS':
        return { ok: true, data: { monitors: await listMonitors(config!) } };
      case 'GET_MONITOR':
        return { ok: true, data: await getMonitor(config!, message.monitorId) };
      case 'CREATE_MONITOR':
        return { ok: true, data: await createMonitor(config!, message.payload) };
      case 'UPDATE_MONITOR':
        return { ok: true, data: await updateMonitor(config!, message.monitorId, message.payload) };
      case 'SET_MONITOR_ENABLED':
        return {
          ok: true,
          data: await setMonitorEnabled(config!, message.monitorId, message.enabled),
        };
      case 'PING_API':
        if (!config) return { ok: false, error: 'Extension APIトークンが未設定です。' };
        await pingApi(config);
        return { ok: true, data: null };
      case 'START_SELECTION_MODE':
        // Handled entirely by the popup (which injects the content script
        // directly); the background worker has no tab context to act on.
        return { ok: false, error: 'unsupported from background' };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});
