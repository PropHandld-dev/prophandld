import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendP2pHandlesChangedEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { notifyLandlordIds } from '@/lib/landlordCoOwners'

const FREEZE_MS = 48 * 60 * 60 * 1000

// A Zelle/Venmo/Cash App handle has no ownership verification behind it at
// all (unlike Stripe/Dwolla, there's no bank check) — the single easiest
// payment destination in the app to silently redirect if an account is
// compromised. This route exists so that protection (the same
// freeze-and-alert pattern already used for Stripe/Dwolla payout changes,
// see dwolla/funding-source/add) can't be bypassed by calling the users
// table directly from the client, the way ZelleVenmoCashAppCard used to.
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

  const { zelle, venmo, cashapp } = (await request.json().catch(() => ({}))) as {
    zelle?: string
    venmo?: string
    cashapp?: string
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
  // to hijack on a first-time add, same distinction the Dwolla freeze logic
  // makes for a brand-new payout account.
  const isChange =
    (!!current?.zelle_handle && current.zelle_handle !== next.zelle_handle) ||
    (!!current?.venmo_handle && current.venmo_handle !== next.venmo_handle) ||
    (!!current?.cashapp_handle && current.cashapp_handle !== next.cashapp_handle)

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
  }

  return NextResponse.json({ ok: true, frozenUntil: isChange ? updates.p2p_handles_frozen_until : null })
}
