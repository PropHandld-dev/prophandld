import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth';
import { account } from '../fixtures/accounts';
import { watchForIssues, assertNoIssues, timed } from '../fixtures/monitoring';

/**
 * The core marketplace loop, start to finish, across all three real roles:
 * renter reports an issue -> landlord sees it, acknowledges it, and opens
 * it for bids -> contractor bids -> landlord selects a bid -> landlord
 * proposes a time -> contractor confirms it and starts the job -> contractor
 * uploads proof of work and marks it complete -> landlord approves and pays
 * -> contractor is paid. This is the single highest-value regression test in
 * the suite — it's the flow that has broken in real, non-obvious ways before
 * (contractor zip/radius matching, notification routing, RLS on the bids
 * table, the Stripe webhook 308 / missing bids.paid_at bug).
 *
 * The payment step is real money moving through a real Stripe PaymentIntent
 * — confirmed running in Stripe TEST mode before this was written (see
 * e2e/README.md). Never point this suite's BASE_URL at an environment
 * running live Stripe keys.
 */

test('report -> bid -> select -> complete -> pay, across renter, landlord, and contractor', async ({ browser }, testInfo) => {
  const marker = `E2E-${Date.now()}`;
  const bidAmount = String(100 + (Date.now() % 200)); // varies per run, easy to spot in the UI

  const renterCtx = await browser.newContext();
  const landlordCtx = await browser.newContext();
  const contractorCtx = await browser.newContext();
  const renter = await renterCtx.newPage();
  const landlord = await landlordCtx.newPage();
  const contractor = await contractorCtx.newPage();

  const renterIssues = watchForIssues(renter);
  const landlordIssues = watchForIssues(landlord);
  const contractorIssues = watchForIssues(contractor);

  try {
    // --- Renter reports the issue ---
    await timed(testInfo, 'renter login', () => login(renter, 'renter', account('renter')));
    await renter.goto('/renter/report');
    await renter.locator('select[name="category"]').selectOption('Garbage Disposal');
    await renter.locator('textarea[name="description"]').fill(
      `${marker} — jammed, makes a humming noise but the blades do not spin.`
    );
    await timed(testInfo, 'renter submit report', async () => {
      await renter.locator('button[type="submit"]').click();
      await renter.waitForURL('**/renter', { timeout: 15_000 });
    });

    // --- Landlord sees the new job ---
    await timed(testInfo, 'landlord login', () => login(landlord, 'landlord', account('landlord')));
    const jobLink = landlord.locator(`a[href^="/landlord/jobs/"]:has-text("${marker}")`);
    await timed(testInfo, 'landlord finds new job', async () => {
      await landlord.goto('/landlord/jobs?filter=all');
      await expect(jobLink).toBeVisible({ timeout: 15_000 });
    });
    await jobLink.click();
    await landlord.waitForURL('**/landlord/jobs/*');
    const jobUrl = landlord.url();

    // A fresh report starts at "pending_approval" — not visible to
    // contractors until the landlord acknowledges it and opens it for bids.
    await timed(testInfo, 'landlord acknowledges and opens for bids', async () => {
      await landlord.getByRole('button', { name: 'Acknowledge' }).click();
      await landlord.getByRole('button', { name: 'Start bidding' }).click();
      await expect(landlord.getByText('Sealed bids')).toBeVisible({ timeout: 15_000 });
    });

    // --- Contractor sees it in "jobs near you" and bids ---
    await timed(testInfo, 'contractor login', () => login(contractor, 'contractor', account('contractor')));
    const availableJobLink = contractor.locator(`#available-jobs a:has-text("${marker}")`);
    await timed(testInfo, 'contractor finds available job', async () => {
      await contractor.goto('/contractor');
      await expect(availableJobLink).toBeVisible({ timeout: 15_000 });
    });
    await availableJobLink.click();
    await contractor.waitForURL('**/bid');
    await contractor.locator('input[name="amount"]').fill(bidAmount);
    await contractor.getByRole('button', { name: 'Continue' }).click();
    await timed(testInfo, 'contractor submit bid', async () => {
      await contractor.getByRole('button', { name: 'Submit bid' }).click();
      await contractor.getByRole('button', { name: 'Confirm' }).click();
      await contractor.waitForURL('**/contractor', { timeout: 15_000 });
    });

    // --- Landlord sees the bid and selects it ---
    await timed(testInfo, 'landlord sees new bid', async () => {
      await landlord.goto(jobUrl);
      await expect(landlord.getByText(`$${bidAmount}`)).toBeVisible({ timeout: 15_000 });
    });
    await landlord.getByRole('button', { name: 'Select this contractor' }).click();
    await landlord.getByRole('button', { name: 'Confirm' }).click();
    await expect(landlord.getByText('Selected contractor')).toBeVisible({ timeout: 15_000 });
    const jobId = jobUrl.split('/jobs/')[1];

    // --- Landlord proposes a time ---
    await timed(testInfo, 'landlord proposes a time', async () => {
      await landlord.getByRole('button', { name: 'Propose a time myself' }).click();
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      await landlord.locator('input[type="date"]').fill(tomorrow);
      await landlord.getByRole('button', { name: 'Propose', exact: true }).click();
      await expect(landlord.getByRole('button', { name: 'Propose a time myself' })).toBeHidden({ timeout: 15_000 });
    });

    // --- Contractor confirms the time and starts the job ---
    await timed(testInfo, 'contractor confirms time and starts job', async () => {
      await contractor.goto(`/contractor/jobs/${jobId}`);
      await contractor.getByRole('button', { name: 'Confirm this time' }).click();
      await contractor.getByRole('button', { name: 'Start job' }).click();
      await expect(contractor.getByRole('button', { name: 'Start job' })).toBeHidden({ timeout: 15_000 });
    });

    // --- Contractor uploads proof of work and marks the job complete ---
    // Three upload inputs render in this fixed order: before, after, receipt.
    await timed(testInfo, 'contractor uploads after-photo and marks complete', async () => {
      await contractor.locator('input[type="file"]').nth(1).setInputFiles('public/logo.png');
      await contractor.getByRole('button', { name: 'Mark job complete' }).click({ timeout: 20_000 });
      await contractor.getByRole('button', { name: 'Mark complete' }).click();
      await contractor.waitForURL('**/contractor', { timeout: 15_000 });
    });

    // --- Landlord approves and pays with the Stripe test debit card ---
    // 4000056655665556 is a genuine Stripe TEST debit card — not 4242..., which
    // registers as a credit card and gets correctly auto-rejected/refunded by
    // this app's own credit-card-detection safety feature on the rent side;
    // job payments accept any card, but using the debit card keeps this
    // suite's test data consistent with what a real landlord would use.
    await timed(testInfo, 'landlord approves and starts payment', async () => {
      await landlord.goto(jobUrl);
      await landlord.getByRole('button', { name: 'Approve' }).click();
      await landlord.getByRole('button', { name: 'Approve & pay' }).click();
      await landlord.getByRole('button', { name: 'Debit card' }).click();
    });

    await timed(testInfo, 'landlord pays via Stripe', async () => {
      // Stripe mounts several "__privateStripeFrame*" iframes (fraud
      // detection, Link, etc.) alongside the visible card form — the
      // documented, stable way to reach the actual payment form is its
      // title, not a name-prefix match against every Stripe frame.
      const stripeFrame = landlord.frameLocator('iframe[title="Secure payment input frame"]');
      await stripeFrame.getByPlaceholder('1234 1234 1234 1234').fill('4000056655665556');
      await stripeFrame.getByPlaceholder('MM / YY').fill('12/34');
      await stripeFrame.getByPlaceholder('CVC').fill('123');
      const zip = stripeFrame.getByPlaceholder('12345');
      if (await zip.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await zip.fill('19019');
      }
      await landlord.getByRole('button', { name: /^Pay \$/ }).click();
      await expect(landlord.getByRole('heading', { name: 'Payment complete' })).toBeVisible({ timeout: 30_000 });
      await landlord.getByRole('button', { name: 'Done' }).click();
    });

    assertNoIssues(renterIssues, testInfo);
    assertNoIssues(landlordIssues, testInfo);
    assertNoIssues(contractorIssues, testInfo);
  } finally {
    await renterCtx.close();
    await landlordCtx.close();
    await contractorCtx.close();
  }
});
