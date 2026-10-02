import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requirementById } from '@/lib/credentialRequirements'
import { sendCredentialSubmittedAdminEmail } from '@/lib/email'

// Tells the admin inbox a contractor just submitted something to review.
// Called fire-and-forget after the client saves the credential row, so a
// failure here never blocks the contractor.
export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (user.user_metadata?.role !== 'contractor') {
    return NextResponse.json({ error: 'Only contractors submit credentials' }, { status: 403 })
  }

  const { requirementId } = (await request.json()) as { requirementId?: string }
  const requirement = requirementId ? requirementById(requirementId) : undefined
  if (!requirement) {
    return NextResponse.json({ error: 'Unknown credential' }, { status: 400 })
  }

  const { data: row } = await getSupabaseAdmin()
    .from('users')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  await sendCredentialSubmittedAdminEmail({
    contractorName: row?.full_name || 'A contractor',
    contractorEmail: row?.email || user.email || '',
    requirementName: requirement.name,
    issuer: requirement.issuer,
  })

  return NextResponse.json({ ok: true })
}
