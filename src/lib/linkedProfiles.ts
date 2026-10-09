import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Role = 'landlord' | 'renter' | 'contractor'
export const ALL_ROLES: Role[] = ['landlord', 'renter', 'contractor']

export type LinkedProfile = {
  id: string
  role: Role
  full_name: string | null
}

// Deliberately NOT one account with multiple roles — users.role is
// permanently immutable per auth user (see api/auth/set-role's own
// comment on why), and role-specific columns (stripe_connect_account_id,
// dwolla_customer_id, address/SSN fields) are flat on users, one value
// per row. A landlord-you and a contractor-you would collide on all of
// that under one row. Instead: every role stays a fully separate auth
// user and public.users row, exactly as today, linked only by a shared
// linked_group_id — so RLS, route guards, and every payment integration
// keep working completely unchanged. "Switching profiles" is really
// "swap which of your own separate sessions is active," made to feel
// instant via mintSessionTokenForUser below.

export async function getLinkedProfiles(admin: SupabaseClient, userId: string): Promise<LinkedProfile[]> {
  const { data: self } = await admin.from('users').select('linked_group_id').eq('id', userId).maybeSingle()
  if (!self?.linked_group_id) return []

  const { data: rows } = await admin
    .from('users')
    .select('id, role, full_name')
    .eq('linked_group_id', self.linked_group_id)
    .neq('id', userId)

  return (rows || []) as LinkedProfile[]
}

// The one-time "add a profile" action, called either from an already
// signed-in dashboard (Profile page) or from the public signup page after
// the existing account's password has been verified (see
// /api/profiles/add-with-password) — both ultimately call this.
export async function createLinkedProfile(
  admin: SupabaseClient,
  {
    fromUserId,
    fromEmail,
    fromFullName,
    fromPhone,
    fromPreferredLanguage,
    newRole,
  }: {
    fromUserId: string
    fromEmail: string
    fromFullName: string | null
    fromPhone: string | null
    fromPreferredLanguage: string | null
    newRole: Role
  }
): Promise<{ newUserId: string } | { error: string }> {
  const { data: fromRow, error: fromRowError } = await admin
    .from('users')
    .select('role, linked_group_id')
    .eq('id', fromUserId)
    .maybeSingle()
  if (fromRowError || !fromRow) return { error: 'Could not load your account' }
  if (fromRow.role === newRole) return { error: `You already have a ${newRole} profile` }

  // The group anchor is the FIRST account's own id, stamped once. Every
  // profile added after that just joins the same group.
  const groupId = fromRow.linked_group_id || fromUserId
  if (!fromRow.linked_group_id) {
    await admin.from('users').update({ linked_group_id: groupId }).eq('id', fromUserId)
  }

  // Already has this role linked? Don't create a duplicate.
  const { data: existing } = await admin.from('users').select('id').eq('linked_group_id', groupId).eq('role', newRole).maybeSingle()
  if (existing) return { error: `You already have a ${newRole} profile` }

  // Supabase requires a unique auth.users.email — a real second signup
  // with the identical address isn't possible at the auth layer. This
  // technical alias is never used to contact anyone: email_confirm is set
  // true below (no confirmation email sent), and public.users.email for
  // the new row is the person's real address, so every actual
  // notification for this profile still reaches their real inbox.
  if (!fromEmail.includes('@')) return { error: 'Missing email' }
  const aliasEmail = fromEmail.replace('@', `+${newRole}@`)

  const randomPassword = crypto.randomBytes(32).toString('base64url')

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: aliasEmail,
    password: randomPassword,
    email_confirm: true,
    app_metadata: { provider: 'email', providers: ['email'], role: newRole },
    // role included here too, mirroring exactly what a normal signUp()
    // call passes in options.data — public.users.role is populated by a
    // DB trigger off auth.users that reads from here, the same trigger
    // ordinary signup relies on. app_metadata.role above is still the
    // only value any server-side authorization check ever trusts.
    user_metadata: {
      full_name: fromFullName,
      phone: fromPhone,
      role: newRole,
      preferred_language: fromPreferredLanguage || 'en',
    },
  })
  if (createError || !created?.user) {
    console.error('createLinkedProfile: auth.admin.createUser failed', createError)
    return { error: 'Could not create the new profile' }
  }

  // The trigger has already created the public.users row by the time
  // createUser() resolves (Postgres triggers run inside the same
  // transaction as the auth.users insert) — but with the alias email and
  // without linked_group_id, which the trigger has no way to know about.
  // upsert rather than a plain update as a defensive fallback, in case
  // that assumption is ever wrong.
  const { error: upsertError } = await admin.from('users').upsert(
    {
      id: created.user.id,
      email: fromEmail,
      full_name: fromFullName,
      phone: fromPhone,
      preferred_language: fromPreferredLanguage || 'en',
      role: newRole,
      linked_group_id: groupId,
    },
    { onConflict: 'id' }
  )
  if (upsertError) {
    console.error('createLinkedProfile: public.users upsert failed', upsertError)
    // Best-effort cleanup — an orphaned auth user with no usable
    // public.users row can't sign in anywhere meaningful anyway, but
    // don't leave it dangling.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
    return { error: 'Could not save the new profile' }
  }

  return { newUserId: created.user.id }
}

// Mints a one-time token that the client exchanges (supabase.auth.verifyOtp)
// for a real session on the target account — the "instant switch," no
// second password ever needed. generateLink never sends an email; it just
// returns the token that an email link would have carried.
export async function mintSessionTokenForEmail(admin: SupabaseClient, email: string): Promise<{ hashedToken: string } | { error: string }> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.properties?.hashed_token) {
    console.error('mintSessionTokenForEmail: generateLink failed', error)
    return { error: 'Could not switch profiles' }
  }
  return { hashedToken: data.properties.hashed_token }
}
