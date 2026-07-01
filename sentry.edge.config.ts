import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://84d5858911395bcf8402c51916c97e49@o4511640622071808.ingest.us.sentry.io/4511640623841280",
  tracesSampleRate: 1,
});