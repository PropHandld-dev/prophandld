import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { sendJobInviteEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { threadId, jobId } = (await request.json()) as { threadId?: string; jobId?: string }
  if (!threadId || !jobId) {
    return NextResponse.json({ error: 'Missing threadId or jobId' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: thread, error: threadError } = await supabaseAdmin
    .from('dm_threads')
    .select('landlord_user_id, other_user_id, other_role')
    .eq('id', threadId)
    .maybeSingle()

  if (threadError || !thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }
  if (user.id !== thread.landlord_user_id || thread.other_role !== 'contractor') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const [{ data: job }, { data: landlord }, { data: contractor }] = await Promise.all([
    supabaseAdmin.from('jobs').select('category').eq('id', jobId).maybeSingle(),
    supabaseAdmin.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('users').select('email').eq('id', thread.other_user_id).maybeSingle(),
  ])

  if (!job || !contractor?.email) {
    return NextResponse.json({ error: 'Job or contractor not found' }, { status: 404 })
  }

  const result = await sendJobInviteEmail({
    to: contractor.email,
    landlordName: landlord?.full_name || 'A landlord',
    jobCategory: job.category,
    jobId,
  })

  if (!result.ok) {
    console.error('dm-job-invite: email failed', result.error)
    return NextResponse.json({ error: 'Could not send invite' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
