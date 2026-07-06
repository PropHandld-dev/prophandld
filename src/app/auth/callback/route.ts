import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')

  // For password recovery, do NOT consume the code here.
  // Email link-scanners pre-fetch links automatically, which would silently
  // burn a one-time code before the user ever clicks it. Instead, pass the
  // code through untouched and only exchange it when the user actually
  // submits their new password.
  if (type === 'recovery' && code) {
    return NextResponse.redirect(
      new URL(`/reset-password?code=${encodeURIComponent(code)}`, requestUrl.origin)
    )
  }

  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/reset-password', requestUrl.origin))
  }

  if (code) {
    const { createServerClient } = await import('@supabase/ssr')
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin))
}