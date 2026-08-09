import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { test, expect } from '@playwright/test';
import type {
  CreateMonitorRequest,
  FeedWithPlaintextToken,
  MonitorWithSelections,
  RunnerResultResponse,
} from '@web-monitor/shared';
import { checkMonitor } from '../src/check.js';

const WORKER_URL = 'http://localhost:8787';
const ADMIN_PASSWORD = 'e2e-admin-secret';
const RUNNER_TOKEN = 'e2e-runner-token';

interface AdminSession {
  cookie: string;
  csrfToken: string;
}

async function loginAsAdmin(): Promise<AdminSession> {
  const res = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = /web_monitor_session=[^;]+/.exec(setCookie);
  if (!match) throw new Error('no session cookie returned');
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  return { cookie: match[0], csrfToken };
}

async function adminFetch(
  session: AdminSession,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('cookie', session.cookie);
  headers.set('content-type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('x-csrf-token', session.csrfToken);
  return fetch(`${WORKER_URL}${path}`, { ...init, headers });
}

test.describe('end-to-end: Selection definition to RSS item', () => {
  test.setTimeout(60_000);

  test('a real Playwright extraction against the fixture pages produces a baseline, then a published RSS change item', async () => {
    const session = await loginAsAdmin();

    const uniqueSuffix = randomUUID().slice(0, 8);
    const contentFeedRes = await adminFetch(session, '/api/feeds', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2Eフィード',
        slug: `e2e-feed-${uniqueSuffix}`,
        kind: 'content',
      }),
    });
    expect(contentFeedRes.status).toBe(201);
    const contentFeed = (await contentFeedRes.json()) as FeedWithPlaintextToken;

    const monitorPayload: CreateMonitorRequest = {
      feedId: contentFeed.id,
      name: 'E2E見出し監視',
      url: 'http://localhost:4173/static.html',
      monitorMode: 'single',
      comparisonRule: 'normalized_equality',
      enabled: true,
      orderIndex: 0,
      selections: [
        {
          label: '見出し',
          selectorType: 'css',
          selector: '#headline',
          selectorCandidates: [],
          extractionMode: 'text',
          attributeName: null,
          matchMode: 'normalized',
          orderIndex: 0,
        },
      ],
    };
    const monitorRes = await adminFetch(session, '/api/monitors', {
      method: 'POST',
      body: JSON.stringify(monitorPayload),
    });
    expect(monitorRes.status).toBe(201);
    const monitor = (await monitorRes.json()) as MonitorWithSelections;

    const browser = await chromium.launch();
    try {
      // Baseline run against the initial fixture snapshot.
      const baselineRunId = randomUUID();
      const baselineOutcome = await checkMonitor(browser, monitor, baselineRunId);
      expect(baselineOutcome.status).toBe('SUCCESS');
      expect(baselineOutcome.values[0]?.displayValue).toBe('初期の見出しです');

      const baselineSubmitRes = await fetch(`${WORKER_URL}/api/runner/results`, {
        method: 'POST',
        headers: { authorization: `Bearer ${RUNNER_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          monitorId: monitor.id,
          runId: baselineRunId,
          startedAt: new Date(Date.now() - baselineOutcome.durationMs).toISOString(),
          finishedAt: new Date().toISOString(),
          status: baselineOutcome.status,
          durationMs: baselineOutcome.durationMs,
          httpStatus: baselineOutcome.httpStatus,
          errorCode: baselineOutcome.errorCode,
          errorMessage: baselineOutcome.errorMessage,
          values: baselineOutcome.values,
        }),
      });
      expect(baselineSubmitRes.status).toBe(200);
      const baselineResult = (await baselineSubmitRes.json()) as RunnerResultResponse;
      expect(baselineResult.status).toBe('baselined');

      const rssAfterBaseline = await fetch(`${WORKER_URL}/rss/${contentFeed.rssToken}.xml`);
      const baselineXml = await rssAfterBaseline.text();
      expect(baselineXml).not.toContain('<item>');

      // Second run against the "changed" fixture snapshot (a real second
      // Playwright extraction, not a stubbed value), submitted for the
      // same Monitor to simulate the page changing between daily runs.
      const changedRunId = randomUUID();
      const changedMonitor: MonitorWithSelections = {
        ...monitor,
        url: 'http://localhost:4173/static-changed.html',
      };
      const changedOutcome = await checkMonitor(browser, changedMonitor, changedRunId);
      expect(changedOutcome.status).toBe('SUCCESS');
      expect(changedOutcome.values[0]?.displayValue).toBe('更新された見出しです');

      const changedSubmitRes = await fetch(`${WORKER_URL}/api/runner/results`, {
        method: 'POST',
        headers: { authorization: `Bearer ${RUNNER_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          monitorId: monitor.id,
          runId: changedRunId,
          startedAt: new Date(Date.now() - changedOutcome.durationMs).toISOString(),
          finishedAt: new Date().toISOString(),
          status: changedOutcome.status,
          durationMs: changedOutcome.durationMs,
          httpStatus: changedOutcome.httpStatus,
          errorCode: changedOutcome.errorCode,
          errorMessage: changedOutcome.errorMessage,
          values: changedOutcome.values,
        }),
      });
      expect(changedSubmitRes.status).toBe(200);
      const changedResult = (await changedSubmitRes.json()) as RunnerResultResponse;
      expect(changedResult.status).toBe('changed');
      expect(changedResult.changeId).toBeTruthy();

      const rssAfterChange = await fetch(`${WORKER_URL}/rss/${contentFeed.rssToken}.xml`);
      expect(rssAfterChange.headers.get('content-type')).toContain('application/rss+xml');
      const changedXml = await rssAfterChange.text();
      expect(changedXml.split('<item>').length - 1).toBe(1);
      expect(changedXml).toContain('E2E見出し監視');
      expect(changedXml).toContain('初期の見出しです');
      expect(changedXml).toContain('更新された見出しです');
      expect(changedXml).toContain(`urn:web-monitor:change:${changedResult.changeId}`);

      // Resubmitting the same transition must not publish a duplicate item.
      const resubmitRes = await fetch(`${WORKER_URL}/api/runner/results`, {
        method: 'POST',
        headers: { authorization: `Bearer ${RUNNER_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          monitorId: monitor.id,
          runId: randomUUID(),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          status: 'SUCCESS',
          durationMs: 1,
          httpStatus: 200,
          errorCode: null,
          errorMessage: null,
          values: changedOutcome.values,
        }),
      });
      const resubmitResult = (await resubmitRes.json()) as RunnerResultResponse;
      expect(resubmitResult.status).toBe('unchanged');

      const rssStable = await (await fetch(`${WORKER_URL}/rss/${contentFeed.rssToken}.xml`)).text();
      expect(rssStable.split('<item>').length - 1).toBe(1);
    } finally {
      await browser.close();
    }
  });
});
