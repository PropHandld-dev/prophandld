import { redirect } from 'next/navigation'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const DASHBOARD_BY_ROLE: Record<string, string> = {
  landlord: '/landlord',
  renter: '/renter',
  contractor: '/contractor',
}

// Confirmed in testing: /renter, /landlord and /contractor had no
// server-side check at all that the signed-in account's actual role
// matched the section — a contractor account could open /renter
// directly and get a fully working renter dashboard shell. Role lives
// in app_metadata (set once at signup, never client-writable), checked
// here the same way every admin route already checks it with
// requireAdminAal2 — this is the equivalent for the three ordinary
// role sections, just without the MFA requirement admin routes need.
// Runs in each section's layout.tsx (a Server Component) so a
// wrong-role request never even renders the dashboard's client bundle,
// rather than flashing it before a client-side redirect fires.
export async function requireRole(expectedRole: 'landlord' | 'renter' | 'contractor') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let actualRole = user.app_metadata?.role
  // Self-heal: app_metadata.role is supposed to get backfilled once, right
  // after first activation (see setAppMetadataRole's own comment), but
  // that only ever fires from specific client-side paths -- confirmed live
  // that a brand-new landlord who confirms via the email OTP code and then
  // logs in with their password (instead of clicking "Continue to
  // dashboard" on the code-confirmation screen) skips every one of those
  // paths, and nothing else ever retries it. Without this fallback that
  // account is permanently bounced between here and /login on every future
  // visit, with no visible error -- this is the first and only point that
  // can still recover it, since app_metadata.role is never client-writable.
  if (!actualRole && user.user_metadata?.role === expectedRole) {
    const admin = getSupabaseAdmin()
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, role: expectedRole },
    })
    if (!error) actualRole = expectedRole
  }

  if (actualRole !== expectedRole) {
    redirect(DASHBOARD_BY_ROLE[actualRole as string] || '/login')
  }
}
