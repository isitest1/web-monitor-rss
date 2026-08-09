import type { Browser } from 'playwright';
import type {
  ExtractedSelectionValue,
  MonitorWithSelections,
  StatusCode,
} from '@web-monitor/shared';
import { createMonitorContext, MAX_RESPONSE_BYTES, PAGE_TIMEOUT_MS } from './browser.js';
import { extractAllSelections } from './extract.js';
import { classifyException, classifyHttpStatus } from './classify-error.js';
import { RunnerCheckError } from './errors.js';

export interface CheckOutcome {
  status: StatusCode;
  httpStatus: number | null;
  values: ExtractedSelectionValue[];
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number;
}

export async function checkMonitor(
  browser: Browser,
  monitor: MonitorWithSelections,
): Promise<CheckOutcome> {
  const startedAt = Date.now();
  const context = await createMonitorContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);

  try {
    const response = await page.goto(monitor.url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    });

    const httpStatus = response?.status() ?? null;
    if (httpStatus !== null) {
      const failureCode = classifyHttpStatus(httpStatus);
      if (failureCode) {
        throw new RunnerCheckError(failureCode, `navigation returned HTTP ${httpStatus}`);
      }
    }

    const contentLength = Number(response?.headers()['content-length'] ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new RunnerCheckError(
        'CONTENT_TOO_LARGE',
        `response size ${contentLength} exceeds limit`,
      );
    }

    const values = await extractAllSelections(page, monitor.selections);

    return {
      status: 'SUCCESS',
      httpStatus,
      values,
      errorCode: null,
      errorMessage: null,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const { statusCode, message } = classifyException(error);
    return {
      status: statusCode,
      httpStatus: null,
      values: [],
      errorCode: statusCode,
      errorMessage: message.slice(0, 2000),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}
