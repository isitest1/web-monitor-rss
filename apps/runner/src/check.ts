import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, BrowserContext } from 'playwright';
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
  tracePath: string | null;
}

const TRACE_DIR = join(process.cwd(), 'traces');

export async function checkMonitor(
  browser: Browser,
  monitor: MonitorWithSelections,
  runId: string,
): Promise<CheckOutcome> {
  const startedAt = Date.now();
  const context = await createMonitorContext(browser);
  const page = await context.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);

  // Traced but content-free: no screenshots/DOM snapshots/sources are
  // captured, only the action/network timeline, so a saved trace never
  // contains page HTML or cookies. Only kept on failure, for diagnosing
  // navigation/selector problems (§13/§15.2).
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });

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
    await context.tracing.stop();

    return {
      status: 'SUCCESS',
      httpStatus,
      values,
      errorCode: null,
      errorMessage: null,
      durationMs: Date.now() - startedAt,
      tracePath: null,
    };
  } catch (error) {
    const { statusCode, message } = classifyException(error);
    const tracePath = await saveFailureTrace(context, monitor.id, runId);
    return {
      status: statusCode,
      httpStatus: null,
      values: [],
      errorCode: statusCode,
      errorMessage: message.slice(0, 2000),
      durationMs: Date.now() - startedAt,
      tracePath,
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function saveFailureTrace(
  context: BrowserContext,
  monitorId: string,
  runId: string,
): Promise<string | null> {
  try {
    await mkdir(TRACE_DIR, { recursive: true });
    const path = join(TRACE_DIR, `${runId}-${monitorId}.zip`);
    await context.tracing.stop({ path });
    return path;
  } catch {
    return null;
  }
}
