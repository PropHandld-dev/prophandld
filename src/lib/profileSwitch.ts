import { supabase } from '@/lib/supabase'

const ROLE_HOME: Record<string, string> = {
  landlord: '/landlord',
  renter: '/renter',
  contractor: '/contractor',
}

// Exchanges a token minted server-side (by /api/profiles/add,
// /api/profiles/switch, or /api/profiles/add-with-password) for a real
// session on that profile — the actual "instant switch," no second
// password, no logout screen. Same mechanism a clicked email magic-link
// uses under the hood; this just skips ever sending the email.
export async function applySessionToken(tokenHash: string, role?: string) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (error) {
    console.error('applySessionToken: verifyOtp failed', error)
    return false
  }
  window.location.href = role && ROLE_HOME[role] ? ROLE_HOME[role] : '/'
  return true
}
