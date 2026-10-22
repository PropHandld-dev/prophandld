import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// Server-side password re-verification for sensitive account changes
// (payout/payment-destination edits). A client-side password prompt alone
// only gates the UI — anyone calling the API route directly with a stolen
// session token (cookie/bearer, no password needed) would sail straight
// through, which defeats the entire point of asking for the password in
// the first place. This re-checks the password against Supabase Auth
// itself, from the server, using a disposable client that never touches
// the request's session cookies (persistSession/autoRefreshToken off) —
// it only asks "is this the right password for this email," it never
// becomes the caller's active session.
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!password) return false
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error } = await client.auth.signInWithPassword({ email, password })
  return !error
}

// Real-world comparison: banks and exchanges that gate withdrawal/payee
// changes behind a *second factor* (not just your standing password) do
// it specifically because a phished or reused password alone no longer
// proves anything once it's compromised — a second channel (an
// authenticator app, here) is what actually raises the bar. This app's
// 2FA is opt-in (TwoFactorAuthCard), so the policy is: if an account has
// a verified TOTP factor enrolled, a payment-destination change (Zelle/
// Venmo/Cash App handles) must be backed by an
// actual completed MFA challenge this session (aal2) — not just
// password — before it's allowed; an account with no factor enrolled at
// all falls back to the existing password-reauth, unchanged.
// getAuthenticatorAssuranceLevel() reads from the caller's own session
// JWT, so this takes the route's already-created per-session authClient
// rather than the admin client.
export async function mfaStepUpStatus(authClient: SupabaseClient): Promise<{ enrolled: boolean; satisfied: boolean }> {
  const { data } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()
  // nextLevel only reaches 'aal2' when a verified factor actually exists —
  // an account with none enrolled stays at nextLevel 'aal1' no matter what.
  const enrolled = data?.nextLevel === 'aal2'
  const satisfied = data?.currentLevel === 'aal2'
  return { enrolled, satisfied }
}
