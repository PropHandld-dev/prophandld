import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth';
import { account } from '../fixtures/accounts';
import { watchForIssues, assertNoIssues, timed } from '../fixtures/monitoring';

/**
 * Core page-load smoke coverage per role: every page in here should render
 * the app shell (bottom tab bar) with no uncaught errors and no 500s from
 * our own API, within the lag threshold. This is the suite to run after any
 * change as a replacement for manually clicking through each role.
 */

test.describe('landlord', () => {
  test('core pages load clean', async ({ page }, testInfo) => {
    const issues = watchForIssues(page);
    await timed(testInfo, 'landlord login', () => login(page, 'landlord', account('landlord')));
    await expect(page.locator('nav[data-tour="bottomtabs"]')).toBeVisible();

    for (const path of ['/landlord/properties', '/landlord/jobs', '/landlord/calendar', '/landlord/rent', '/landlord/reports']) {
      await timed(testInfo, `goto ${path}`, () => page.goto(path, { waitUntil: 'networkidle' }));
      await expect(page.locator('nav[data-tour="bottomtabs"]')).toBeVisible();
    }

    assertNoIssues(issues, testInfo);
  });
});

test.describe('renter', () => {
  test('core pages load clean', async ({ page }, testInfo) => {
    const issues = watchForIssues(page);
    await timed(testInfo, 'renter login', () => login(page, 'renter', account('renter')));
    await expect(page.locator('nav[data-tour="bottomtabs"]')).toBeVisible();

    for (const path of ['/renter/rent', '/renter/report', '/renter/documents', '/renter/calendar']) {
      await timed(testInfo, `goto ${path}`, () => page.goto(path, { waitUntil: 'networkidle' }));
      await expect(page.locator('nav[data-tour="bottomtabs"]')).toBeVisible();
    }

    assertNoIssues(issues, testInfo);
  });
});

test.describe('contractor', () => {
  test('core pages load clean', async ({ page }, testInfo) => {
    const issues = watchForIssues(page);
    await timed(testInfo, 'contractor login', () => login(page, 'contractor', account('contractor')));
    await expect(page.locator('nav[data-tour="bottomtabs"]')).toBeVisible();

    // earnings is a drill-in page with no bottom tab bar by design, so it gets its own check
    await timed(testInfo, 'goto /contractor/earnings', () => page.goto('/contractor/earnings', { waitUntil: 'networkidle' }));
    await expect(page.getByRole('heading', { name: 'Past jobs & earnings' })).toBeVisible();

    for (const path of ['/contractor/calendar', '/contractor/settings']) {
      await timed(testInfo, `goto ${path}`, () => page.goto(path, { waitUntil: 'networkidle' }));
      await expect(page.locator('nav[data-tour="bottomtabs"]')).toBeVisible();
    }

    assertNoIssues(issues, testInfo);
  });
});
