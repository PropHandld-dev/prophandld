import { supabase } from '@/lib/supabase'
import { SITE_URL } from '@/lib/site'

export type OAuthProvider = 'google' | 'apple'

// Supabase's own redirect appends ?code=... (PKCE) onto whatever
// redirectTo already is, query string and all -- carrying role/intent/ref
// through this way means /auth/callback can finish a brand-new OAuth
// signup exactly like the email/password flow does, without a second
// "who are you" screen after the provider already answered that. Only
// matters for a genuinely new account: an existing user's app_metadata.role
// already wins over anything carried here (see /auth/callback's own
// comment).
export async function startOAuth(
  provider: OAuthProvider,
  params: { role?: string; intent?: string; referrerId?: string } = {}
) {
  const qs = new URLSearchParams()
  if (params.role) qs.set('role', params.role)
  if (params.intent) qs.set('intent', params.intent)
  if (params.referrerId) qs.set('ref', params.referrerId)
  const query = qs.toString()

  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${SITE_URL}/auth/callback${query ? `?${query}` : ''}`,
    },
  })
}
