import type { MonitorWithSelections } from '@web-monitor/shared';
import { SelectionController } from './selection-controller.js';
import { resolveDraftFromSelection } from './resolve-draft.js';
import { sendExtensionMessage } from '../lib/messages.js';

declare global {
  interface Window {
    __webMonitorSelectionController?: SelectionController;
  }
}

// Set by the popup (via chrome.storage.session, not a message payload —
// chrome.scripting.executeScript with `files` carries no arguments) right
// before it opens/activates the Monitor's own tab and injects this script,
// so this reads it once and clears it immediately.
const PENDING_EDIT_STORAGE_KEY = 'editingMonitorId';

async function consumePendingEditMonitorId(): Promise<string | null> {
  try {
    const stored = await chrome.storage.session.get(PENDING_EDIT_STORAGE_KEY);
    const monitorId = stored[PENDING_EDIT_STORAGE_KEY];
    if (typeof monitorId !== 'string') return null;
    await chrome.storage.session.remove(PENDING_EDIT_STORAGE_KEY);
    return monitorId;
  } catch (error) {
    // Falls back to create-mode rather than leaving bootstrap() unhandled
    // and the overlay never appearing at all (e.g. if the background
    // hasn't granted this content script access to chrome.storage.session
    // yet — see service-worker.ts's setAccessLevel call).
    console.warn(
      'failed to read pending edit state:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

async function bootstrap(): Promise<void> {
  // Injected on demand via chrome.scripting.executeScript; injecting again
  // while already active (e.g. clicking "start selection" twice) must be a
  // no-op rather than creating a second overlay.
  if (window.__webMonitorSelectionController) return;
  const controller = new SelectionController();
  window.__webMonitorSelectionController = controller;

  const monitorId = await consumePendingEditMonitorId();
  if (!monitorId) {
    void controller.start();
    return;
  }

  const result = await sendExtensionMessage<MonitorWithSelections>({
    type: 'GET_MONITOR',
    monitorId,
  });
  if (!result.ok) {
    // Falls back to a plain new-Monitor session rather than failing
    // silently, so the user isn't left with a dead popup click.
    void controller.start();
    return;
  }

  const monitor = result.data;
  controller.start({
    monitorId: monitor.id,
    monitorMode: monitor.monitorMode,
    monitorName: monitor.name,
    groupName: monitor.groupName,
    selections: monitor.selections.map((selection) => resolveDraftFromSelection(selection)),
  });
}

bootstrap().catch((error: unknown) => {
  console.error(
    'Web Monitor RSS: failed to start the Visual Selector:',
    error instanceof Error ? error.message : String(error),
  );
});
