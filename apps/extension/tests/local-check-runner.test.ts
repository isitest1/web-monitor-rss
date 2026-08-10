import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonitorWithSelections } from '@web-monitor/shared';

const submitExtensionResult = vi.fn(
  async (_config: unknown, _payload: { monitorId: string; status: string }) => ({
    monitorId: _payload.monitorId,
    status: 'baselined',
    changeId: null,
  }),
);
const listDueLocalMonitors = vi.fn(async (_config: unknown) => [] as MonitorWithSelections[]);

vi.mock('../src/lib/api-client.js', () => ({
  submitExtensionResult: (...args: unknown[]) =>
    (submitExtensionResult as (...a: unknown[]) => unknown)(...args),
  listDueLocalMonitors: (...args: unknown[]) =>
    (listDueLocalMonitors as (...a: unknown[]) => unknown)(...args),
}));

type Listener = (details: never) => void;

type Scenario =
  | { kind: 'success'; httpStatus?: number }
  | { kind: 'http-error'; httpStatus: number }
  | { kind: 'navigation-error'; error: string };

function createChromeMock(getScenario: () => Scenario) {
  const onCompletedListeners: Listener[] = [];
  const onErrorListeners: Listener[] = [];
  const onHeadersListeners: Listener[] = [];
  let nextTabId = 1;

  function fireScenario(tabId: number): void {
    const scenario = getScenario();
    if (scenario.kind === 'success') {
      onHeadersListeners.forEach((fn) =>
        fn({ tabId, frameId: 0, statusCode: scenario.httpStatus ?? 200 } as never),
      );
      onCompletedListeners.forEach((fn) => fn({ tabId, frameId: 0 } as never));
    } else if (scenario.kind === 'http-error') {
      onHeadersListeners.forEach((fn) =>
        fn({ tabId, frameId: 0, statusCode: scenario.httpStatus } as never),
      );
      onCompletedListeners.forEach((fn) => fn({ tabId, frameId: 0 } as never));
    } else {
      onErrorListeners.forEach((fn) => fn({ tabId, frameId: 0, error: scenario.error } as never));
    }
  }

  const tabsCreate = vi.fn(async () => {
    const id = nextTabId++;
    return { id } as chrome.tabs.Tab;
  });
  const tabsRemove = vi.fn(async () => undefined);
  const tabsSendMessage = vi.fn(async () => ({ ok: true, values: [] }));
  const scriptingExecuteScript = vi.fn(async () => undefined);

  const mock = {
    tabs: { create: tabsCreate, remove: tabsRemove, sendMessage: tabsSendMessage },
    scripting: { executeScript: scriptingExecuteScript },
    webNavigation: {
      onCompleted: {
        addListener: (fn: Listener) => onCompletedListeners.push(fn),
        removeListener: (fn: Listener) => {
          const i = onCompletedListeners.indexOf(fn);
          if (i >= 0) onCompletedListeners.splice(i, 1);
        },
      },
      onErrorOccurred: {
        addListener: (fn: Listener) => {
          onErrorListeners.push(fn);
          // Registered last by waitForTabLoad, so all listeners are attached
          // by the time this fires the scenario asynchronously.
          const tabId = nextTabId - 1;
          queueMicrotask(() => fireScenario(tabId));
        },
        removeListener: (fn: Listener) => {
          const i = onErrorListeners.indexOf(fn);
          if (i >= 0) onErrorListeners.splice(i, 1);
        },
      },
    },
    webRequest: {
      onHeadersReceived: {
        addListener: (fn: Listener) => onHeadersListeners.push(fn),
        removeListener: (fn: Listener) => {
          const i = onHeadersListeners.indexOf(fn);
          if (i >= 0) onHeadersListeners.splice(i, 1);
        },
      },
    },
  };

  return { mock, tabsCreate, tabsRemove, tabsSendMessage, scriptingExecuteScript };
}

function buildMonitor(overrides: Partial<MonitorWithSelections> = {}): MonitorWithSelections {
  return {
    id: 'monitor-1',
    feedId: 'feed-1',
    name: 'ローカル監視',
    url: 'https://example.com/local',
    monitorMode: 'single',
    comparisonRule: 'normalized_equality',
    executionMode: 'local',
    checkIntervalSec: 3600,
    enabled: true,
    orderIndex: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    selections: [
      {
        id: 'selection-1',
        monitorId: 'monitor-1',
        label: '見出し',
        selectorType: 'css',
        selector: '#headline',
        selectorCandidates: [],
        extractionMode: 'text',
        attributeName: null,
        normalization: {
          extractFirstNumber: false,
          parsePrice: false,
          removeStrings: [],
          caseInsensitive: false,
        },
        matchMode: 'normalized',
        orderIndex: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

const config = { apiBaseUrl: 'https://worker.example', extensionToken: 'ext-token' };

describe('runLocalCheck', () => {
  let scenario: Scenario;
  let chromeSetup: ReturnType<typeof createChromeMock>;

  beforeEach(() => {
    vi.resetModules();
    submitExtensionResult.mockClear();
    listDueLocalMonitors.mockClear();
    scenario = { kind: 'success' };
    chromeSetup = createChromeMock(() => scenario);
    (globalThis as unknown as { chrome: unknown }).chrome = chromeSetup.mock;
  });

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it('opens an inactive background tab and closes it after a successful check', async () => {
    const { runLocalCheck } = await import('../src/background/local-check-runner.js');
    await runLocalCheck(config, buildMonitor());

    expect(chromeSetup.tabsCreate).toHaveBeenCalledWith({
      url: 'https://example.com/local',
      active: false,
    });
    expect(chromeSetup.tabsRemove).toHaveBeenCalledWith(1);
    expect(submitExtensionResult).toHaveBeenCalledTimes(1);
    const payload = submitExtensionResult.mock.calls[0]?.[1] as { status: string };
    expect(payload.status).toBe('SUCCESS');
  });

  it('classifies an HTTP error status and still closes the tab', async () => {
    scenario = { kind: 'http-error', httpStatus: 404 };
    const { runLocalCheck } = await import('../src/background/local-check-runner.js');
    await runLocalCheck(config, buildMonitor());

    expect(chromeSetup.tabsRemove).toHaveBeenCalledWith(1);
    const payload = submitExtensionResult.mock.calls[0]?.[1] as { status: string };
    expect(payload.status).toBe('HTTP_ERROR');
  });

  it('classifies a navigation error and still closes the tab', async () => {
    scenario = { kind: 'navigation-error', error: 'net::ERR_NAME_NOT_RESOLVED' };
    const { runLocalCheck } = await import('../src/background/local-check-runner.js');
    await runLocalCheck(config, buildMonitor());

    expect(chromeSetup.tabsRemove).toHaveBeenCalledWith(1);
    const payload = submitExtensionResult.mock.calls[0]?.[1] as { status: string };
    expect(payload.status).toBe('HTTP_ERROR');
  });
});

describe('runDueLocalChecks', () => {
  let chromeSetup: ReturnType<typeof createChromeMock>;

  beforeEach(() => {
    vi.resetModules();
    submitExtensionResult.mockClear();
    listDueLocalMonitors.mockClear();
    chromeSetup = createChromeMock(() => ({ kind: 'success' }));
    (globalThis as unknown as { chrome: unknown }).chrome = chromeSetup.mock;
  });

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it('runs every due monitor sequentially', async () => {
    listDueLocalMonitors.mockResolvedValue([
      buildMonitor({ id: 'monitor-a' }),
      buildMonitor({ id: 'monitor-b' }),
    ]);
    const { runDueLocalChecks } = await import('../src/background/local-check-runner.js');
    await runDueLocalChecks(config);

    expect(submitExtensionResult).toHaveBeenCalledTimes(2);
    const submittedIds = submitExtensionResult.mock.calls.map(
      (call) => (call[1] as { monitorId: string }).monitorId,
    );
    expect(submittedIds).toEqual(['monitor-a', 'monitor-b']);
  });

  it('does not start a second pass while one is already in progress', async () => {
    listDueLocalMonitors.mockResolvedValue([buildMonitor({ id: 'monitor-a' })]);
    const { runDueLocalChecks } = await import('../src/background/local-check-runner.js');

    const first = runDueLocalChecks(config);
    const second = runDueLocalChecks(config);
    await Promise.all([first, second]);

    expect(listDueLocalMonitors).toHaveBeenCalledTimes(1);
  });
});
