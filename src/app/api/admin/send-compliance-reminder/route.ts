import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminAal2 } from '@/lib/adminAccess'
import { sendComplianceReminderEmail } from '@/lib/email'
import { sendPush } from '@/lib/push'
import { logAdminAudit } from '@/lib/auditLog'
import { emailAllowed } from '@/lib/notificationPrefs'

// Manual nudge from the admin roster — email and push today; SMS is
// deliberately left out until Twilio is actually confirmed live in
// production (see sendSms, which already no-ops safely if it isn't), so
// this isn't wired to silently do nothing and look like it worked.
export async function POST(request: Request) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !(await requireAdminAal2(authClient, user.id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { contractorUserId, missingNames } = await request.json()
  if (!contractorUserId || !Array.isArray(missingNames) || missingNames.length === 0) {
    return NextResponse.json({ error: 'contractorUserId and missingNames are required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: contractor, error } = await admin
    .from('users')
    .select('email, full_name, preferred_language, email_notifications_enabled')
    .eq('id', contractorUserId)
    .maybeSingle()

  if (error || !contractor?.email) {
    console.error('send-compliance-reminder: contractor lookup failed', { contractorUserId, error })
    return NextResponse.json({ error: 'Could not find that contractor' }, { status: 404 })
  }

  const lang = contractor.preferred_language === 'es' ? 'es' : 'en'
  // Goes to the contractor, not admin@ — not covered by the documented
  // "admin-facing emails stay unconditional" exemption, so it should
  // respect their notification preference like any other routine email.
  if (emailAllowed(contractor)) {
    const result = await sendComplianceReminderEmail({
      to: contractor.email,
      contractorName: contractor.full_name || 'there',
      missingNames,
      lang,
    })
    if (!result.ok) {
      return NextResponse.json({ error: 'Email failed to send' }, { status: 500 })
    }
  }

  await sendPush(contractorUserId, {
    title: missingNames.length === 1 ? 'A credential is missing from your profile' : `${missingNames.length} credentials are missing from your profile`,
    body: missingNames.length === 1 ? missingNames[0] : missingNames.slice(0, 2).join(', ') + (missingNames.length > 2 ? '…' : ''),
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.prophandld.com'}/contractor/settings`,
  }).catch((err) => console.error('send-compliance-reminder: sendPush failed', { contractorUserId, err }))

  await logAdminAudit({
    actionType: 'compliance_reminder_sent',
    actorUserId: user.id,
    actorEmail: user.email,
    targetUserId: contractorUserId,
    targetEmail: contractor.email,
    targetRole: 'contractor',
    detail: { missingNames },
  })

  return NextResponse.json({ ok: true })
}
