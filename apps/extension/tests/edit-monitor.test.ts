import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the popup-freeze bug: activating/creating a tab
// shifts window focus away from the action popup, and Chrome kills an MV3
// popup's JS the instant it loses focus. startEditMonitor must therefore
// live in (and be fully exercisable from) the background service worker,
// not popup.ts — this test calls it exactly as service-worker.ts does,
// with no popup involved at all.

function createChromeMock() {
  type UpdateListener = (tabId: number, info: chrome.tabs.TabChangeInfo) => void;
  const onUpdatedListeners: UpdateListener[] = [];
  const sessionData: Record<string, unknown> = {};
  let nextTabId = 1;
  let lastTabId = 0;

  const tabsQuery = vi.fn(async () => [] as chrome.tabs.Tab[]);
  const tabsCreate = vi.fn(async () => {
    const id = nextTabId++;
    lastTabId = id;
    return { id } as chrome.tabs.Tab;
  });
  const tabsUpdate = vi.fn(async (tabId: number) => {
    lastTabId = tabId;
  });
  const scriptingExecuteScript = vi.fn(async () => undefined);

  const mock = {
    tabs: {
      query: tabsQuery,
      create: tabsCreate,
      update: tabsUpdate,
      onUpdated: {
        // Registered by waitForTabComplete only *after* tabs.create/update
        // has resolved, so firing "complete" here — rather than inside
        // tabsCreate itself — guarantees a listener actually exists to
        // receive it (matches the working pattern in
        // local-check-runner.test.ts).
        addListener: (fn: UpdateListener) => {
          onUpdatedListeners.push(fn);
          queueMicrotask(() => fn(lastTabId, { status: 'complete' }));
        },
        removeListener: (fn: UpdateListener) => {
          const i = onUpdatedListeners.indexOf(fn);
          if (i >= 0) onUpdatedListeners.splice(i, 1);
        },
      },
    },
    scripting: { executeScript: scriptingExecuteScript },
    storage: {
      session: {
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(sessionData, items);
        }),
      },
    },
  };

  return { mock, tabsQuery, tabsCreate, tabsUpdate, scriptingExecuteScript, sessionData };
}

describe('startEditMonitor', () => {
  let chromeSetup: ReturnType<typeof createChromeMock>;

  beforeEach(() => {
    vi.resetModules();
    chromeSetup = createChromeMock();
    (globalThis as unknown as { chrome: unknown }).chrome = chromeSetup.mock;
  });

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it('stashes the pending edit id, opens a new tab, and injects the content script', async () => {
    const { startEditMonitor } = await import('../src/background/edit-monitor.js');
    await startEditMonitor('monitor-1', 'https://example.com/page');

    expect(chromeSetup.sessionData.editingMonitorId).toBe('monitor-1');
    expect(chromeSetup.tabsCreate).toHaveBeenCalledWith({
      url: 'https://example.com/page',
      active: true,
    });
    expect(chromeSetup.scriptingExecuteScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ['content-script.js'],
    });
  });

  it('reuses and activates an already-open tab for the same URL instead of opening a new one', async () => {
    chromeSetup.tabsQuery.mockResolvedValue([{ id: 42, status: 'complete' } as chrome.tabs.Tab]);
    const { startEditMonitor } = await import('../src/background/edit-monitor.js');
    await startEditMonitor('monitor-2', 'https://example.com/existing');

    expect(chromeSetup.tabsCreate).not.toHaveBeenCalled();
    expect(chromeSetup.tabsUpdate).toHaveBeenCalledWith(42, { active: true });
    expect(chromeSetup.scriptingExecuteScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content-script.js'],
    });
  });
});
