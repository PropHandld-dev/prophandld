# Regression suite

Runs against production by default — there's no staging environment, since
pushing to `main` deploys straight to prod. Use `BASE_URL` to point it at a
Vercel preview deployment instead when you want to test a branch before
merging.

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

Run this after any change that touches auth, the report/bid/select flow, or
a core dashboard page — it's meant to replace clicking through each role by
hand.

## What's covered

- `tests/smoke.spec.ts` — every core page per role loads cleanly: no
  uncaught JS errors, no 500s from our own API, under a lag threshold.
- `tests/job-lifecycle.spec.ts` — the real marketplace loop across all
  three roles in one test: renter reports an issue, landlord sees it,
  contractor bids, landlord selects the bid.

## What's deliberately not covered

Nothing past "landlord selects a bid." Mark-complete and approve-&-pay
drive a real Stripe PaymentIntent, and this suite has no reliable way to
confirm from here whether the deployed Stripe keys are in test or live
mode. A suite meant to be safe to run at any time should never risk
triggering a real charge. If you want that path automated too, it needs an
explicit, opt-in test gated on a confirmed-test-mode check — ask before
building it blind.

Each test run also creates one real "Garbage Disposal" job and one real bid
against the shared test accounts (title/description marked `E2E-<timestamp>`
so it's easy to spot and archive later) — it's additive, not destructive,
but it's not nothing either.
