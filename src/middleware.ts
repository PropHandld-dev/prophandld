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
  matcher: '/:path*',
}
