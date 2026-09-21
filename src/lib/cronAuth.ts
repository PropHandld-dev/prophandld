import type { NextRequest } from 'next/server'

// Scheduled jobs must only run when Vercel (or you) present the shared
// secret. If CRON_SECRET isn't configured the job is refused in production,
// rather than left open to anyone who finds the URL. (Local development
// without a secret is still allowed so the jobs can be tried by hand.)
export function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}
