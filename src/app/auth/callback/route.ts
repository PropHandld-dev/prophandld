import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getAccountRole } from '@/lib/accountRole'

const ALLOWED_ROLES = ['landlord', 'renter', 'contractor']

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

  if (!code) {
    return NextResponse.redirect(new URL('/login', requestUrl.origin))
  }

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
  const { data: exchangeData } = await supabase.auth.exchangeCodeForSession(code)
  const user = exchangeData?.user

  // Email/password (and email-confirmation-link) signups still land here
  // too -- redirect() below is this route's only exit for any of them,
  // same as before this OAuth support existed. What's new is the branch
  // below, which only ever fires for an OAuth sign-in that has no role at
  // all yet.
  if (!user) {
    return NextResponse.redirect(new URL('/login', requestUrl.origin))
  }

  const existingRole = getAccountRole(user)

  if (!existingRole) {
    // A brand-new OAuth account. Unlike email/password signup, there's no
    // signUp({ data: { role, ... } }) step beforehand -- Google/Apple never
    // send a role, so without this, the account would be created with no
    // role at all and genuinely nowhere to land (the exact failure mode
    // accountRole.ts's own comment describes for a different cause). role/
    // intent/ref were carried here as query params on redirectTo by
    // startOAuth() (see oauth.ts) and survive Supabase's own ?code=...
    // append onto that same URL.
    const role = requestUrl.searchParams.get('role')
    const intent = requestUrl.searchParams.get('intent')
    const referrerId = requestUrl.searchParams.get('ref')

    if (role && ALLOWED_ROLES.includes(role)) {
      const admin = getSupabaseAdmin()
      await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, role } })

      // The public.users row was just created by the same auth.users
      // trigger email signup relies on (confirmed in welcome/route.ts's
      // own comment) -- but that trigger only reads whatever was in
      // raw_user_meta_data at insert time, which never includes a role
      // for an OAuth-created user. Patched in directly here; left
      // retryable (not awaited-and-thrown) since a role in app_metadata
      // alone is already enough to route this person correctly.
      await admin.from('users').update({ role }).eq('id', user.id).then(({ error }) => {
        if (error) console.error('auth/callback: could not set public.users.role for OAuth signup', error)
      })

      if (referrerId && referrerId !== user.id) {
        const { data: referrerExists } = await admin.from('users').select('id').eq('id', referrerId).maybeSingle()
        if (referrerExists) {
          await admin.from('referrals').insert({ referrer_user_id: referrerId, referred_user_id: user.id }).then(({ error }) => {
            if (error && error.code !== '23505') console.error('auth/callback: referral insert failed', error)
          })
        }
      }

      // Same cookies this exchange just set, forwarded so the welcome
      // route's own auth check succeeds -- reuses its already-correct,
      // already-tested atomic "only once" claim rather than duplicating
      // that logic here.
      fetch(new URL('/api/auth/welcome', requestUrl.origin), {
        method: 'POST',
        headers: { cookie: cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ') },
      }).catch((err) => console.error('auth/callback: welcome email call failed', err))

      const destination =
        role === 'landlord'
          ? intent === 'property_manager'
            ? '/landlord/pm?onboarding=1'
            : '/landlord/properties/new?onboarding=1'
          : role === 'renter'
            ? '/renter'
            : '/contractor'
      return NextResponse.redirect(new URL(destination, requestUrl.origin))
    }

    // No valid role carried through (direct hit on this callback, or a
    // provider flow started without going through startOAuth) -- same
    // dead end accountRole.ts's own history describes, so send them
    // somewhere that can actually ask, rather than a blank /login.
    return NextResponse.redirect(new URL('/signup', requestUrl.origin))
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin))
}
