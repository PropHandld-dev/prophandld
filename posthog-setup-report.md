# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the prophandld Next.js App Router project. PostHog is initialized via `instrumentation-client.ts` (the recommended approach for Next.js 15.3+), routed through a reverse proxy (`/ingest`) configured in `next.config.ts` to avoid ad-blocker interference. A server-side PostHog client was created for API route tracking. The home page was converted to a client component to capture CTA click events, and the existing Sentry example page and API route were instrumented with PostHog events alongside their existing Sentry code.

| Event Name | Description | File |
|---|---|---|
| `deploy_now_clicked` | User clicked the Deploy Now CTA button on the home page. | `src/app/page.tsx` |
| `documentation_clicked` | User clicked the Documentation link on the home page. | `src/app/page.tsx` |
| `templates_link_clicked` | User clicked the Templates link in the home page description. | `src/app/page.tsx` |
| `learning_center_clicked` | User clicked the Learning Center link in the home page description. | `src/app/page.tsx` |
| `sentry_error_triggered` | User clicked the Throw Sample Error button on the Sentry example page. | `src/app/sentry-example-page/page.tsx` |
| `sentry_example_api_called` | Server-side: the Sentry example API route was called. | `src/app/api/sentry-example-api/route.ts` |

## Next steps

We've built some insights and a dashboard to monitor user behavior based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/488990/dashboard/1769876)
- [CTA Clicks Over Time](https://us.posthog.com/project/488990/insights/kbR7HmJP)
- [Deploy Now Clicks](https://us.posthog.com/project/488990/insights/LlnIyJQy)
- [Documentation Clicks](https://us.posthog.com/project/488990/insights/W4slbq5D)
- [Error Trigger Events](https://us.posthog.com/project/488990/insights/d7y0WlcJ)
- [Unique Visitors Clicking CTAs](https://us.posthog.com/project/488990/insights/H9aZ0cu3)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
