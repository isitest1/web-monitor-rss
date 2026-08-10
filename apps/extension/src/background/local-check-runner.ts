import {
  classifyException,
  classifyHttpStatus,
  PAGE_TIMEOUT_MS,
  type ExtractedSelectionValue,
  type MonitorWithSelections,
  type StatusCode,
} from '@web-monitor/shared';
import type { ExtensionConfig } from '../lib/storage.js';
import { listDueLocalMonitors, submitExtensionResult } from '../lib/api-client.js';
import type {
  RunLocalExtractionMessage,
  RunLocalExtractionResult,
} from '../lib/local-check-protocol.js';

const MAX_ERROR_MESSAGE_LENGTH = 2000;

interface CheckOutcome {
  status: StatusCode;
  httpStatus: number | null;
  values: ExtractedSelectionValue[];
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number;
}

interface NavigationResult {
  httpStatus: number | null;
  failure: { statusCode: StatusCode; message: string } | null;
}

/**
 * Waits for a background tab's main-frame navigation to finish (or fail, or
 * exceed the shared PAGE_TIMEOUT_MS), capturing the HTTP status via
 * webRequest so it can be classified the same way Runner's Playwright
 * response.status() is (§8.3, apps/runner/src/check.ts).
 */
function waitForTabLoad(tabId: number): Promise<NavigationResult> {
  return new Promise((resolve) => {
    let settled = false;
    let httpStatus: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const onHeadersReceived = (details: chrome.webRequest.WebResponseHeadersDetails): void => {
      if (details.tabId === tabId && details.frameId === 0) {
        httpStatus = details.statusCode;
      }
    };

    const finish = (failure: { statusCode: StatusCode; message: string } | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      chrome.webNavigation.onCompleted.removeListener(onCompleted);
      chrome.webNavigation.onErrorOccurred.removeListener(onErrorOccurred);
      chrome.webRequest.onHeadersReceived.removeListener(onHeadersReceived);
      resolve({ httpStatus, failure });
    };

    const onCompleted = (
      details: chrome.webNavigation.WebNavigationFramedCallbackDetails,
    ): void => {
      if (details.tabId !== tabId || details.frameId !== 0) return;
      if (httpStatus !== null) {
        const failureCode = classifyHttpStatus(httpStatus);
        if (failureCode) {
          finish({ statusCode: failureCode, message: `navigation returned HTTP ${httpStatus}` });
          return;
        }
      }
      finish(null);
    };

    const onErrorOccurred = (
      details: chrome.webNavigation.WebNavigationFramedErrorCallbackDetails,
    ): void => {
      if (details.tabId !== tabId || details.frameId !== 0) return;
      finish(classifyException(new Error(details.error)));
    };

    chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, {
      urls: ['http://*/*', 'https://*/*'],
      tabId,
      types: ['main_frame'],
    });
    chrome.webNavigation.onCompleted.addListener(onCompleted);
    chrome.webNavigation.onErrorOccurred.addListener(onErrorOccurred);

    timeoutHandle = setTimeout(() => {
      finish({ statusCode: 'TIMEOUT', message: `page load exceeded ${PAGE_TIMEOUT_MS}ms` });
    }, PAGE_TIMEOUT_MS);
  });
}

async function runExtraction(
  tabId: number,
  monitor: MonitorWithSelections,
): Promise<{ values: ExtractedSelectionValue[] } | { statusCode: StatusCode; message: string }> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['local-check-content.js'],
  });
  const message: RunLocalExtractionMessage = {
    type: 'RUN_LOCAL_EXTRACTION',
    selections: monitor.selections,
  };
  const result = (await chrome.tabs.sendMessage(tabId, message)) as RunLocalExtractionResult;
  if (result.ok) return { values: result.values };
  return { statusCode: result.statusCode, message: result.message };
}

/**
 * Opens monitor.url in a background (non-active) tab, waits for it to
 * load, extracts all Selections via the injected local-check-content
 * script, and submits the outcome to POST /api/extension/results — the
 * local-mode counterpart of apps/runner/src/check.ts's checkMonitor, using
 * the same StatusCode vocabulary (§8.3) so Watchlist/RSS behavior is
 * identical regardless of which source ran the check.
 */
export async function runLocalCheck(
  config: ExtensionConfig,
  monitor: MonitorWithSelections,
): Promise<void> {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  let tab: chrome.tabs.Tab | undefined;
  let outcome: CheckOutcome;

  try {
    tab = await chrome.tabs.create({ url: monitor.url, active: false });
    if (!tab.id) throw new Error('failed to open background tab');
    const tabId = tab.id;

    const { httpStatus, failure } = await waitForTabLoad(tabId);
    if (failure) {
      outcome = {
        status: failure.statusCode,
        httpStatus,
        values: [],
        errorCode: failure.statusCode,
        errorMessage: failure.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
        durationMs: Date.now() - startedAt,
      };
    } else {
      const extraction = await runExtraction(tabId, monitor);
      if ('statusCode' in extraction) {
        outcome = {
          status: extraction.statusCode,
          httpStatus,
          values: [],
          errorCode: extraction.statusCode,
          errorMessage: extraction.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
          durationMs: Date.now() - startedAt,
        };
      } else {
        outcome = {
          status: 'SUCCESS',
          httpStatus,
          values: extraction.values,
          errorCode: null,
          errorMessage: null,
          durationMs: Date.now() - startedAt,
        };
      }
    }
  } catch (error) {
    const classified = classifyException(error);
    outcome = {
      status: classified.statusCode,
      httpStatus: null,
      values: [],
      errorCode: classified.statusCode,
      errorMessage: classified.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (tab?.id) {
      await chrome.tabs.remove(tab.id).catch(() => undefined);
    }
  }

  try {
    await submitExtensionResult(config, {
      monitorId: monitor.id,
      runId,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      status: outcome.status,
      durationMs: outcome.durationMs,
      httpStatus: outcome.httpStatus,
      errorCode: outcome.errorCode,
      errorMessage: outcome.errorMessage,
      values: outcome.values,
    });
  } catch (error) {
    console.warn(
      `failed to submit local check result for monitor=${monitor.id}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

// Synchronous check-and-set (no `await` between them) so two calls arriving
// in the same JS turn — e.g. the alarm tick firing while a manual
// RUN_LOCAL_CHECK_NOW is still running — can never both pass the guard; a
// promise-based (chrome.storage) lock would have a check-then-set race.
let localCheckInProgress = false;

/**
 * Runs every local-mode Monitor that is currently due, sequentially (never
 * in parallel, to bound how many sites get contacted at once), guarded so
 * an alarm tick firing mid-run is a no-op rather than starting an
 * overlapping pass.
 */
export async function runDueLocalChecks(config: ExtensionConfig): Promise<void> {
  if (localCheckInProgress) return;
  localCheckInProgress = true;
  try {
    const monitors = await listDueLocalMonitors(config);
    for (const monitor of monitors) {
      await runLocalCheck(config, monitor);
    }
  } finally {
    localCheckInProgress = false;
  }
}
