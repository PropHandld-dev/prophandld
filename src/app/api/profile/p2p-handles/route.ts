import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendP2pHandlesChangedEmail, sendP2pHandlesChangedRenterEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'
import { getActiveRenterIds } from '@/lib/landlordRenters'
import { verifyPassword, mfaStepUpStatus } from '@/lib/reauth'

const FREEZE_MS = 48 * 60 * 60 * 1000

// A Zelle/Venmo/Cash App handle has no ownership verification behind it at
// all (unlike Stripe, there's no bank check) — the single easiest payment
// destination in the app to silently redirect if an account is
// compromised. This route exists so that protection (the same
// freeze-and-alert pattern already used for Stripe payout changes) can't
// be bypassed by calling the users table directly from the client, the
// way ZelleVenmoCashAppCard used to.
export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const { data: row } = await admin
    .from('users')
    .select('zelle_handle, venmo_handle, cashapp_handle, p2p_handles_frozen_until')
    .eq('id', user.id)
    .maybeSingle()

  return NextResponse.json({
    zelle: row?.zelle_handle || '',
    venmo: row?.venmo_handle || '',
    cashapp: row?.cashapp_handle || '',
    frozenUntil: row?.p2p_handles_frozen_until || null,
  })
}

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { zelle, venmo, cashapp, password } = (await request.json().catch(() => ({}))) as {
    zelle?: string
    venmo?: string
    cashapp?: string
    password?: string
  }

  const admin = getSupabaseAdmin()
  const { data: current } = await admin
    .from('users')
    .select('zelle_handle, venmo_handle, cashapp_handle')
    .eq('id', user.id)
    .maybeSingle()

  const next = {
    zelle_handle: zelle?.trim() || null,
    venmo_handle: venmo?.trim() || null,
    cashapp_handle: cashapp?.trim() || null,
  }

  // Only an edit to an already-set handle is a redirection risk — nothing
  // to hijack on a first-time add, same distinction the Stripe payout
  // freeze logic makes for a brand-new payout account.
  const isChange =
    (!!current?.zelle_handle && current.zelle_handle !== next.zelle_handle) ||
    (!!current?.venmo_handle && current.venmo_handle !== next.venmo_handle) ||
    (!!current?.cashapp_handle && current.cashapp_handle !== next.cashapp_handle)

  // The client already gates this behind a password prompt (see
  // ZelleVenmoCashAppCard's reauth step), but that only guards the UI —
  // anyone who could call this route directly with a stolen session token
  // (no password needed) would otherwise sail straight through. Re-checking
  // the password here, server-side, is what actually makes the reauth real.
  // An account with 2FA enrolled gets held to the stronger bar instead —
  // see mfaStepUpStatus's own comment for why a second factor beats a
  // standing password for exactly this kind of change.
  if (isChange) {
    const mfa = await mfaStepUpStatus(authClient)
    if (mfa.enrolled && !mfa.satisfied) {
      return NextResponse.json({ error: 'mfa_required' }, { status: 428 })
    }
    if (!mfa.satisfied) {
      if (!user.email || !(await verifyPassword(user.email, password || ''))) {
        return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
      }
    }
  }

  const updates: Record<string, unknown> = { ...next }
  if (isChange) {
    updates.p2p_handles_frozen_until = new Date(Date.now() + FREEZE_MS).toISOString()
  }

  const { error: updateError } = await admin.from('users').update(updates).eq('id', user.id)
  if (updateError) {
    console.error('profile/p2p-handles: update failed', updateError)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }

  if (isChange) {
    const landlordIds = await notifyLandlordIds(admin, user.id)
    const { data: recipients } = await admin
      .from('users')
      .select('id, email, full_name, preferred_language')
      .in('id', landlordIds)

    const editorName = recipients?.find((r) => r.id === user.id)?.full_name || 'Your landlord'

    await Promise.allSettled(
      (recipients || []).map(async (recipient) => {
        if (recipient.email) {
          await sendP2pHandlesChangedEmail({
            to: recipient.email,
            name: recipient.full_name || 'there',
            lang: recipient.preferred_language === 'es' ? 'es' : 'en',
          }).catch((err) => console.error('profile/p2p-handles: alert email failed', err))
        }
        await sendPush(recipient.id, {
          title: 'Zelle/Venmo/Cash App info changed',
          body: "If this wasn't you, contact us immediately.",
          url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/profile`,
        }).catch((err) => console.error('profile/p2p-handles: alert push failed', err))
      })
    )

    // Also tell the renters themselves, not just the landlord's own
    // account — a second, independent set of eyes. An alert that only
    // reaches the landlord's own email is a weak safeguard if that's the
    // very account that's compromised; a renter has their own money on
    // the line and a real reason to double-check before paying.
    const renterIds = await getActiveRenterIds(admin, user.id)
    if (renterIds.length > 0) {
      const { data: renters } = await admin
        .from('users')
        .select('id, email, full_name, preferred_language')
        .in('id', renterIds)

      await Promise.allSettled(
        (renters || []).map(async (renter) => {
          if (renter.email) {
            await sendP2pHandlesChangedRenterEmail({
              to: renter.email,
              name: renter.full_name || 'there',
              landlordName: editorName,
              lang: renter.preferred_language === 'es' ? 'es' : 'en',
            }).catch((err) => console.error('profile/p2p-handles: renter alert email failed', err))
          }
          await sendPush(renter.id, {
            title: "Your landlord's payment info changed",
            body: 'Double-check the handle before paying this way. See your rent page for details.',
            url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/renter/rent`,
          }).catch((err) => console.error('profile/p2p-handles: renter alert push failed', err))
        })
      )
    }
  }

  return NextResponse.json({ ok: true, frozenUntil: isChange ? updates.p2p_handles_frozen_until : null })
}
