import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { loadChatParticipants } from '@/lib/chatParticipants'
import { requireAdminAal2, adminUserIdSet } from '@/lib/adminAccess'


type Member = { userId: string; role: string }

// Names, not alerts: everyone who can legitimately see this conversation gets
// a name and role, including people the alert list leaves out: a tenant whose
// lease has since ended, the person who reported the job, anyone who bid on
// it, and anyone who has posted in it.
async function membersForNaming(admin: any, ref: { jobId?: string | null; threadId?: string | null }, base: Member[]) {
  const members = new Map<string, string>(base.map((p) => [p.userId, p.role]))
  const bidders = new Set<string>()
  const add = (id: string | null | undefined, role: string) => {
    if (id && !members.has(id)) members.set(id, role)
  }

  if (ref.jobId) {
    const { data: job } = await admin
      .from('jobs')
      .select('unit_id, reported_by, units(properties(owner_user_id))')
      .eq('id', ref.jobId)
      .maybeSingle()
    add((job?.units as any)?.properties?.owner_user_id, 'landlord')
    add(job?.reported_by, 'renter')

    if (job?.unit_id) {
      // Deliberately includes ended tenancies too — a job that happened
      // during a now-former tenant's occupancy should still name them,
      // not show "Unknown". But caught live by an external audit
      // (TURN-07): with no date bound at all, EVERY tenant this unit has
      // ever had got named on EVERY job on that unit, including a
      // brand-new tenant's own report created entirely after a prior
      // tenant moved out. Each tenancy's `created_at` (a DB-assigned
      // timestamp, not the landlord-editable `lease_start`) marks
      // exactly when that occupancy began; ordering tenancies by it and
      // treating each one's window as ending where the next one begins
      // (or still open, for whichever is current) tells you which single
      // tenant was actually in place when this job happened.
      const { data: tenancies } = await admin.from('tenancies').select('id, renter_user_id, created_at').eq('unit_id', job.unit_id).order('created_at', { ascending: true })
      const ordered = tenancies || []
      const coveringTenancyIds: string[] = []
      ordered.forEach((t: any, i: number) => {
        const windowEnd = ordered[i + 1]?.created_at ?? null
        if (job.created_at >= t.created_at && (!windowEnd || job.created_at < windowEnd)) {
          add(t.renter_user_id, 'renter')
          coveringTenancyIds.push(t.id)
        }
      })
      if (coveringTenancyIds.length > 0) {
        const { data: occupants } = await admin
          .from('tenancy_occupants')
          .select('renter_user_id')
          .in('tenancy_id', coveringTenancyIds)
        for (const o of occupants || []) add(o.renter_user_id, 'renter')
      }
    }

    // A contractor whose bid was not selected is not in the conversation, so
    // they are only named if they actually posted in it (handled below).
    const { data: bids } = await admin.from('bids').select('contractor_user_id').eq('job_id', ref.jobId)
    for (const b of bids || []) bidders.add(b.contractor_user_id)
  }

  const column = ref.jobId ? 'job_id' : 'thread_id'
  const { data: senders } = await admin
    .from('messages')
    .select('sender_user_id')
    .eq(column, ref.jobId || ref.threadId)
    .limit(500)
  for (const m of senders || []) add(m.sender_user_id, bidders.has(m.sender_user_id) ? 'contractor' : 'other')

  return members
}

// Who is in this conversation, with names, so the chat can label every
// message and show "With …". Only people in the conversation may ask.
export async function GET(request: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const jobId = request.nextUrl.searchParams.get('jobId')
  const threadId = request.nextUrl.searchParams.get('threadId')
  if (!jobId && !threadId) {
    return NextResponse.json({ error: 'Missing jobId or threadId' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const loaded = await loadChatParticipants(admin, { jobId, threadId })
  if (!loaded) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const members = await membersForNaming(admin, { jobId, threadId }, loaded.participants)
  // Real authorization, not just a naming label (that's adminUserIdSet
  // below, which only tags senders as staff in an already-authorized
  // response) — this is the gate deciding whether a non-participant can
  // see who's in someone else's conversation at all. Needs the same
  // aal2 check every other admin-privileged action requires, not just
  // admin_users membership — a leaked password alone shouldn't be
  // enough to pull the participant list of any job or DM on the
  // platform by id.
  const isAdmin = await requireAdminAal2(authClient, user.id)
  if (!members.has(user.id) && !isAdmin) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const { data: people } = await admin
    .from('users')
    .select('id, full_name, email')
    .in('id', Array.from(members.keys()))
  const byId = new Map((people || []).map((u: any) => [u.id, u]))
  const staffIds = await adminUserIdSet(Array.from(members.keys()))

  return NextResponse.json({
    participants: Array.from(members.entries()).map(([userId, role]) => {
      const person: any = byId.get(userId)
      // Staff who posted (for example an admin) are labelled as such rather than "Unknown".
      const isStaff = role === 'other' && staffIds.has(userId)
      return { role: isStaff ? 'admin' : role, user_id: userId, full_name: person?.full_name ?? null }
    }),
  })
}
