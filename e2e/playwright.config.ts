import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.e2e.local') });
// NEXT_PUBLIC_SUPABASE_URL/ANON_KEY — public, anon-scoped values already
// shipped to every browser; RLS, not secrecy, is what protects data behind
// them. Loaded from the app's own .env.local so the RLS suite tests the
// same project the app actually runs against, with nothing duplicated.
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// There's no staging environment for this app (push to main deploys straight
// to prod), so this suite targets production by default. Point BASE_URL at
// a Vercel preview deployment to run it there instead.
const BASE_URL = process.env.BASE_URL || 'https://www.prophandld.com';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000, // the full job-lifecycle test now spans scheduling, photo upload, and a real Stripe payment
  expect: { timeout: 10_000 },
  fullyParallel: false, // the role accounts and demo data are shared and stateful
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
