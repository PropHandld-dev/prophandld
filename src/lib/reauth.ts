import { createClient } from '@supabase/supabase-js'

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
