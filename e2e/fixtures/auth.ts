import { Page, expect } from '@playwright/test';
import { Account, Role } from './accounts';

const DASHBOARD_PATH: Record<Role, string> = {
  landlord: '/landlord',
  renter: '/renter',
  contractor: '/contractor',
};

/** Logs in through the real UI (no API shortcut) so auth itself stays covered. */
export async function login(page: Page, role: Role, account: Account) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**${DASHBOARD_PATH[role]}**`, { timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(DASHBOARD_PATH[role]));
}
