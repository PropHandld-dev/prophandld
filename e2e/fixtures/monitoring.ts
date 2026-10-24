import { Page, TestInfo } from '@playwright/test';

/**
 * Soft-fail lag threshold. This catches real regressions (an N+1 query, a
 * missing index, a hung RPC) without flagging normal network variance —
 * anything this slow on a simple page load is worth a look regardless of
 * why the suite happened to run slow that day.
 */
const SLOW_LOAD_MS = 8_000;

export interface PageIssues {
  pageErrors: string[];
  failedRequests: string[];
}

/** Attaches console/page-error and failed-request capture for the test's full duration. */
export function watchForIssues(page: Page): PageIssues {
  const issues: PageIssues = { pageErrors: [], failedRequests: [] };

  page.on('pageerror', (err) => {
    issues.pageErrors.push(err.message);
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    // 401s on auth-check endpoints and 404s on optional assets are routine;
    // anything 500+ on our own API routes is not.
    if (status >= 500 && url.includes('/api/')) {
      issues.failedRequests.push(`${status} ${url}`);
    }
  });

  return issues;
}

export function assertNoIssues(issues: PageIssues, testInfo: TestInfo) {
  if (issues.pageErrors.length) {
    testInfo.annotations.push({ type: 'page-errors', description: issues.pageErrors.join('\n') });
  }
  if (issues.failedRequests.length) {
    testInfo.annotations.push({ type: 'failed-requests', description: issues.failedRequests.join('\n') });
  }
  if (issues.pageErrors.length || issues.failedRequests.length) {
    throw new Error(
      `Found ${issues.pageErrors.length} page error(s) and ${issues.failedRequests.length} failed API request(s):\n` +
        [...issues.pageErrors, ...issues.failedRequests].join('\n')
    );
  }
}

/** Times a navigation/action and logs it; throws only if it crosses the slow-load bar. */
export async function timed<T>(testInfo: TestInfo, label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  testInfo.annotations.push({ type: 'timing', description: `${label}: ${ms}ms` });
  if (ms > SLOW_LOAD_MS) {
    throw new Error(`"${label}" took ${ms}ms — over the ${SLOW_LOAD_MS}ms lag threshold`);
  }
  return result;
}
