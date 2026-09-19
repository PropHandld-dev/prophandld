import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendContractorVerificationDecisionEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !user.email?.endsWith('@prophandld.com')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { contractorUserId, approved, notes } = (await request.json()) as {
    contractorUserId?: string
    approved?: boolean
    notes?: string | null
  }
  if (!contractorUserId || typeof approved !== 'boolean') {
    return NextResponse.json({ error: 'Missing contractorUserId or approved' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: contractor, error: contractorError } = await supabaseAdmin
    .from('users')
    .select('email, full_name')
    .eq('id', contractorUserId)
    .maybeSingle()

  if (contractorError) {
    console.error('notify-verification-decision: error fetching contractor', contractorError)
  }

  if (!contractor?.email) {
    return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })
  }

  const result = await sendContractorVerificationDecisionEmail({
    to: contractor.email,
    contractorName: contractor.full_name || 'there',
    approved,
    notes,
  })

  if (!result.ok) {
    console.error('notify-verification-decision: sendEmail failed', result)
    return NextResponse.json({ error: 'Could not send email' }, { status: 500 })
  }

  await sendPush(contractorUserId, {
    title: approved ? "You're verified ✓" : 'Verification update',
    body: approved ? 'Landlords will now see a Verified badge on your bids.' : "Your verification wasn't approved. Check the details.",
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://prophandld.com'}/contractor/settings`,
  }).catch((err) => console.error('notify-verification-decision: sendPush failed', err))

  return NextResponse.json({ ok: true })
}
