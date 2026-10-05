import { redirect } from 'next/navigation'
import { createClient } from '@/lib/auth'

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

  const actualRole = user.app_metadata?.role
  if (actualRole !== expectedRole) {
    redirect(DASHBOARD_BY_ROLE[actualRole as string] || '/login')
  }
}
