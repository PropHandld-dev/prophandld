import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Role = 'landlord' | 'renter' | 'contractor'
export const ALL_ROLES: Role[] = ['landlord', 'renter', 'contractor']

export type LinkedProfile = {
  id: string
  role: Role
  full_name: string | null
}

// Deliberately NOT one account with multiple roles — role lives only in
// auth.users.app_metadata (never a public.users column — confirmed: no
// other code anywhere in this app queries one), permanently immutable per
// auth user (see api/auth/set-role's own comment on why), and
// role-specific columns (stripe_connect_account_id, dwolla_customer_id,
// address/SSN fields) are flat on public.users, one value per row. A
// landlord-you and a contractor-you would collide on all of that under
// one row. Instead: every role stays a fully separate auth user and
// public.users row, exactly as today, linked only by a shared
// linked_group_id — so RLS, route guards, and every payment integration
// keep working completely unchanged. "Switching profiles" is really "swap
// which of your own separate sessions is active," made to feel instant
// via mintSessionTokenForEmail below.

export async function getLinkedProfiles(admin: SupabaseClient, userId: string): Promise<LinkedProfile[]> {
  const { data: self } = await admin.from('users').select('linked_group_id').eq('id', userId).maybeSingle()
  if (!self?.linked_group_id) return []

  const { data: rows } = await admin
    .from('users')
    .select('id, full_name')
    .eq('linked_group_id', self.linked_group_id)
    .neq('id', userId)
  if (!rows || rows.length === 0) return []

  // role only exists in each account's own auth.users.app_metadata, not a
  // public.users column — no batch "get many users by id" in the admin
  // API, so this is one call per linked profile. Realistically 1-2 at a
  // time, not a real cost.
  const profiles = await Promise.all(
    rows.map(async (row) => {
      const { data: authUser } = await admin.auth.admin.getUserById(row.id)
      const role = authUser?.user?.app_metadata?.role as Role | undefined
      return role ? { id: row.id, role, full_name: row.full_name } : null
    })
  )
  return profiles.filter((p): p is LinkedProfile => p !== null)
}

// The one-time "add a profile" action, called either from an already
// signed-in dashboard (Profile page) or from the public signup page after
// the existing account's password has been verified (see
// /api/profiles/add-with-password) — both ultimately call this.
export async function createLinkedProfile(
  admin: SupabaseClient,
  {
    fromUserId,
    fromRole,
    fromEmail,
    fromFullName,
    fromPhone,
    fromPreferredLanguage,
    newRole,
  }: {
    fromUserId: string
    fromRole: Role
    fromEmail: string
    fromFullName: string | null
    fromPhone: string | null
    fromPreferredLanguage: string | null
    newRole: Role
  }
): Promise<{ newUserId: string } | { error: string }> {
  if (fromRole === newRole) return { error: `You already have a ${newRole} profile` }

  const { data: fromRow, error: fromRowError } = await admin
    .from('users')
    .select('linked_group_id')
    .eq('id', fromUserId)
    .maybeSingle()
  if (fromRowError || !fromRow) {
    console.error('createLinkedProfile: could not load fromRow', fromRowError, 'fromUserId:', fromUserId)
    return { error: 'Could not load your account' }
  }

  // The group anchor is the FIRST account's own id, stamped once. Every
  // profile added after that just joins the same group.
  const groupId = fromRow.linked_group_id || fromUserId
  if (!fromRow.linked_group_id) {
    await admin.from('users').update({ linked_group_id: groupId }).eq('id', fromUserId)
  }

  // Already has this role linked? Don't create a duplicate.
  const existingLinked = await getLinkedProfiles(admin, fromUserId)
  if (existingLinked.some((p) => p.role === newRole)) {
    return { error: `You already have a ${newRole} profile` }
  }

  // Both auth.users.email AND public.users.email are unique-constrained
  // (confirmed live: 23505 on a real attempt to reuse the real address) —
  // so the new profile can't literally share the primary's email value in
  // either table, not just the auth layer. This alias is used for both.
  // Standard email subaddressing (RFC 5233) means it still lands in the
  // same inbox on every major provider (Gmail, Outlook/Microsoft 365,
  // iCloud, Fastmail, ProtonMail all honor the "+" convention) — the real
  // gap is a provider that doesn't, where this profile's own notification
  // emails would bounce silently while push and in-app chat still work.
  // Good enough for now; a dedicated contact-email column decoupled from
  // the auth email would remove this gap entirely but touches every
  // email-sending call site in the app, out of scope for this pass.
  if (!fromEmail.includes('@')) return { error: 'Missing email' }
  const aliasEmail = fromEmail.replace('@', `+${newRole}@`)

  const randomPassword = crypto.randomBytes(32).toString('base64url')

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: aliasEmail,
    password: randomPassword,
    email_confirm: true,
    app_metadata: { provider: 'email', providers: ['email'], role: newRole },
    user_metadata: {
      full_name: fromFullName,
      phone: fromPhone,
      preferred_language: fromPreferredLanguage || 'en',
    },
  })
  if (createError || !created?.user) {
    console.error('createLinkedProfile: auth.admin.createUser failed', createError)
    return { error: 'Could not create the new profile' }
  }

  // The trigger that mirrors auth.users into public.users has already run
  // by the time createUser() resolves (Postgres triggers run inside the
  // same transaction as the auth.users insert) — but with the alias email
  // and without linked_group_id, which the trigger has no way to know
  // about. upsert rather than a plain update as a defensive fallback, in
  // case that assumption is ever wrong. No role column here — it isn't one.
  const { error: upsertError } = await admin.from('users').upsert(
    {
      id: created.user.id,
      email: aliasEmail,
      full_name: fromFullName,
      phone: fromPhone,
      preferred_language: fromPreferredLanguage || 'en',
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
