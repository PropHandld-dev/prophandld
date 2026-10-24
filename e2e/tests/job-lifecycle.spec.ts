import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth';
import { account } from '../fixtures/accounts';
import { watchForIssues, assertNoIssues, timed } from '../fixtures/monitoring';

/**
 * The core marketplace loop, end to end, across all three real roles:
 * renter reports an issue -> landlord sees it -> contractor bids ->
 * landlord selects a bid. This is the single highest-value regression test
 * in the suite — it's the flow that has broken in real, non-obvious ways
 * before (contractor zip/radius matching, notification routing, RLS on the
 * bids table).
 *
 * Deliberately stops before "mark complete" / "approve & pay": that step
 * drives a real Stripe PaymentIntent, and this suite has no safe way to
 * confirm from here whether the deployed keys are in Stripe test mode or
 * live mode. Automating a real charge is not a risk worth taking inside a
 * suite that's meant to be safe to re-run at any time — see e2e/README.md.
 */

test('report -> bid -> select, across renter, landlord, and contractor', async ({ browser }, testInfo) => {
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

    assertNoIssues(renterIssues, testInfo);
    assertNoIssues(landlordIssues, testInfo);
    assertNoIssues(contractorIssues, testInfo);
  } finally {
    await renterCtx.close();
    await landlordCtx.close();
    await contractorCtx.close();
  }
});
