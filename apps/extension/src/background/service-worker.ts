import type { ExtensionMessage, MessageResult } from '../lib/messages.js';
import { getConfig } from '../lib/storage.js';
import {
  createMonitor,
  getMonitor,
  listMonitors,
  pingApi,
  setMonitorEnabled,
  updateMonitor,
} from '../lib/api-client.js';
import { runDueLocalChecks, runLocalCheck } from './local-check-runner.js';

// Best-effort, opt-in-per-Monitor periodic execution (only for Monitors
// with execution_mode 'local'), matching CLAUDE.md §2/§4.1: the extension
// does not monitor anything on its own initiative outside of this. Runs
// only while Chrome is open; an MV3 service worker can be evicted between
// ticks, which is an accepted limitation (§8.6 excludes local-mode
// Monitors from the Runner heartbeat watchdog for the same reason).
const LOCAL_CHECK_ALARM_NAME = 'local-check-tick';
const LOCAL_CHECK_ALARM_PERIOD_MINUTES = 15;

function scheduleLocalCheckAlarm(): void {
  chrome.alarms.create(LOCAL_CHECK_ALARM_NAME, {
    periodInMinutes: LOCAL_CHECK_ALARM_PERIOD_MINUTES,
  });
}

chrome.runtime.onInstalled.addListener(scheduleLocalCheckAlarm);
chrome.runtime.onStartup.addListener(scheduleLocalCheckAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== LOCAL_CHECK_ALARM_NAME) return;
  void getConfig().then((config) => runDueLocalChecks(config));
});

async function handleMessage(message: ExtensionMessage): Promise<MessageResult<unknown>> {
  const config = await getConfig();

  try {
    switch (message.type) {
      case 'LIST_MONITORS':
        return { ok: true, data: { monitors: await listMonitors(config) } };
      case 'GET_MONITOR':
        return { ok: true, data: await getMonitor(config, message.monitorId) };
      case 'CREATE_MONITOR':
        return { ok: true, data: await createMonitor(config, message.payload) };
      case 'UPDATE_MONITOR':
        return { ok: true, data: await updateMonitor(config, message.monitorId, message.payload) };
      case 'SET_MONITOR_ENABLED':
        return {
          ok: true,
          data: await setMonitorEnabled(config, message.monitorId, message.enabled),
        };
      case 'PING_API':
        await pingApi(config);
        return { ok: true, data: null };
      case 'RUN_LOCAL_CHECK_NOW': {
        const monitor = await getMonitor(config, message.monitorId);
        await runLocalCheck(config, monitor);
        return { ok: true, data: null };
      }
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
