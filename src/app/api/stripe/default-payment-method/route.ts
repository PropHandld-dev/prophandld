import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getDefaultPaymentMethod } from '@/lib/defaultPaymentMethod'
import { verifyPassword, mfaStepUpStatus } from '@/lib/reauth'

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const pm = await getDefaultPaymentMethod(supabaseAdmin, user.id)
  return NextResponse.json({ paymentMethod: pm })
}

// Removing it is not itself a hijack risk the way changing a payout
// destination is (nobody benefits from making YOUR card uncharged), but
// it does remove a real financial commitment a contractor may be relying
// on, so it still gets the same reauth bar as adding/changing one.
export async function DELETE(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { password } = (await request.json().catch(() => ({}))) as { password?: string }

  const mfa = await mfaStepUpStatus(authClient)
  if (mfa.enrolled && !mfa.satisfied) {
    return NextResponse.json({ error: 'mfa_required' }, { status: 428 })
  }
  if (!mfa.satisfied) {
    if (!user.email || !(await verifyPassword(user.email, password || ''))) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
    }
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      default_payment_method_id: null,
      default_payment_method_type: null,
      default_payment_method_label: null,
      default_payment_method_set_at: null,
    })
    .eq('id', user.id)

  if (error) {
    console.error('default-payment-method DELETE: could not clear', error)
    return NextResponse.json({ error: 'Could not remove' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
