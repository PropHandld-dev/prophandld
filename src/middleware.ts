import { NextRequest, NextResponse } from 'next/server'

// Vercel keeps the auto-assigned *.vercel.app URL live and crawlable in
// parallel with the real custom domain, with nothing by default telling
// search engines which one is canonical — Google indexed it and started
// showing it in search results under Vercel's own favicon instead of
// Prophandld's. A permanent redirect is what actually fixes that: nothing
// ever gets served FROM that host for a crawler to index in the first
// place, and any link already indexed there now lands on the real site
// instead of a dead end.
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
  if (host.endsWith('.vercel.app')) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://www.prophandld.com')
    return NextResponse.redirect(url, 308)
  }
  return NextResponse.next()
}

export const config = {
  // Vercel invokes cron jobs (and Stripe hits webhooks) directly against the
  // *.vercel.app production host, never the custom domain, and a cron
  // invocation does not follow redirects — it just treats the 308 as the
  // job "completing" and moves on. Redirecting /api/* here silently stopped
  // every one of this app's 6 cron jobs (rent reminders, credential expiry,
  // job auto-approve, appointment reminders, metrics snapshot, stale
  // disputes) from ever actually running. Excluding /api entirely: nothing
  // under it should ever redirect regardless of which host it's reached on.
  matcher: ['/((?!api/).*)'],
}
