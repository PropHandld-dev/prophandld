# Regression suite

Runs against production by default — there's no staging environment, since
pushing to `main` deploys straight to prod. Use `BASE_URL` to point it at a
Vercel preview deployment instead when you want to test a branch before
merging.

## ⚠ This suite moves real money

`job-lifecycle.spec.ts` runs a full job payment through a real Stripe
PaymentIntent using Stripe's test debit card (`4000056655665556`). This is
only safe because the deployed Stripe keys were confirmed to be in **test**
mode on 2026-10-24. If the app's Stripe keys are ever switched to live mode,
this test will attempt a real charge against a real card network — **do not
run this suite, or point `BASE_URL` at any environment, without reconfirming
test mode first.**

## Setup (one-time)

```bash
cp .env.e2e.example .env.e2e.local   # fill in the three test accounts
npx playwright install chromium
```

## Running it

```bash
npm run test:e2e            # run everything headless
npx playwright test --config=e2e/playwright.config.ts --ui   # interactive, for debugging a failure
npm run test:e2e:report     # open the HTML report from the last run
```

Run this after any change that touches auth, the job lifecycle, scheduling,
photo upload, or payment — it's meant to replace clicking through each role
by hand.

## What's covered

- `tests/smoke.spec.ts` — every core page per role loads cleanly: no
  uncaught JS errors, no 500s from our own API, under a lag threshold.
- `tests/job-lifecycle.spec.ts` — the real marketplace loop, start to
  finish, across all three roles in one test: renter reports an issue,
  landlord acknowledges it and opens it for bids, contractor bids, landlord
  selects the bid and proposes a time, contractor confirms the time and
  starts the job, contractor uploads proof of work and marks it complete,
  landlord approves and pays with a Stripe test card, contractor is paid.

## What's still not covered

- Other payment methods (bank/ACH, Zelle/Venmo/Cash App for rent) — only
  the debit-card path is exercised.
- Disputes, price-change requests, DIY (landlord handles it themselves
  instead of opening for bids), and the 3-day auto-approve cron.
- Anything load- or concurrency-related — this suite proves correctness on
  a single run, not behavior under many simultaneous users.

Each test run creates one real "Garbage Disposal" job, one real bid, and one
real (test-mode) payment against the shared test accounts (description
marked `E2E-<timestamp>` so it's easy to spot and archive later) — it's
additive, not destructive, but it's not nothing either.
