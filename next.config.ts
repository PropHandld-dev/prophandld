import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Photos are plain <img> tags (never next/image), so the built-in image
  // resizer is switched off: less attack surface and no image-optimization bill.
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
  // Baseline security headers — none were set at all before this. Kept to
  // the well-established, low-risk ones: nothing here can break Stripe.js,
  // PostHog, Sentry, or Google Places, which a hand-written
  // Content-Security-Policy easily could without real browser testing
  // against every one of those integrations, so a full CSP is
  // deliberately left for a separate, carefully-tested pass rather than
  // guessed at here.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking: this app should never be framed by another site.
          { key: "X-Frame-Options", value: "DENY" },
          // Stops a browser from guessing a response's content type in a
          // way that can turn an upload into executable script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Sends the full URL only to Prophandld's own pages, and just
          // the origin (no path/query) to anyone else — a reasonable
          // default, not a promise this app currently depends on since
          // auth tokens live in URL fragments, which browsers never
          // include in a referrer at all.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disables browser features this app never uses directly — not
          // "payment", deliberately: Stripe's PaymentElement can surface
          // Apple Pay/Google Pay quick-pay buttons, which need it, and
          // disabling it would silently break those without an obvious
          // error anywhere.
          { key: "Permissions-Policy", value: "camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "prophandld",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
});