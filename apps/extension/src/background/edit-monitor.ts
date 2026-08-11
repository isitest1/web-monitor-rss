function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    function listener(updatedTabId: number, info: chrome.tabs.TabChangeInfo): void {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Opens (or focuses) the Monitor's own tab and injects the Visual Selector
 * in edit mode. Must run in the background service worker, not the popup:
 * activating/creating a tab shifts window focus away from the action
 * popup, and Chrome closes an MV3 popup the instant it loses focus, which
 * kills any of its still-running JS — so waiting for the tab to load and
 * then injecting the content script can never complete from popup.ts.
 */
export async function startEditMonitor(monitorId: string, url: string): Promise<void> {
  await chrome.storage.session.set({ editingMonitorId: monitorId });
  const [existingTab] = await chrome.tabs.query({ url });
  let tabId: number | undefined;
  if (existingTab?.id) {
    tabId = existingTab.id;
    await chrome.tabs.update(tabId, { active: true });
    if (existingTab.status !== 'complete') await waitForTabComplete(tabId);
  } else {
    const created = await chrome.tabs.create({ url, active: true });
    tabId = created.id;
    if (tabId) await waitForTabComplete(tabId);
  }
  if (!tabId) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
}
