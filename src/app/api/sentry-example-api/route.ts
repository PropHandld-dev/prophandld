import * as Sentry from "@sentry/nextjs";
import { getPostHogClient } from "@/lib/posthog-server";
export const dynamic = "force-dynamic";

class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}

// A faulty API route to test Sentry's error monitoring
export function GET() {
  Sentry.logger.info("Sentry example API called");
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "anonymous",
    event: "sentry_example_api_called",
    properties: { source: "sentry-example-page" },
  });
  throw new SentryExampleAPIError(
    "This error is raised on the backend called by the example page.",
  );
}
