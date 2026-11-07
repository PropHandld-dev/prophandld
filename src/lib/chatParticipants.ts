import { notifyLandlordIds } from '@/lib/landlordCoOwners'

export type ChatRole = 'landlord' | 'renter' | 'contractor'
export type ChatParticipant = { userId: string; role: ChatRole }

/**
 * Who is in a conversation. A job chat is the landlord, the current tenant
 * (and any co-renters) and the contractor whose bid was accepted. A direct
 * message is the landlord and the one other person. Used by the message
 * alerts and by the chat itself, so both always agree on who is in it.
 */
export async function loadChatParticipants(admin: any, ref: { jobId?: string | null; threadId?: string | null }) {
  const participants: ChatParticipant[] = []
  let context = ''
  let path: (role: ChatRole) => string = (role) => `/${role}/messages`

  if (ref.jobId) {
    const { data: job } = await admin
      .from('jobs')
      .select('id, category, unit_id, created_at, units(properties(address, owner_user_id))')
      .eq('id', ref.jobId)
      .maybeSingle()
    if (!job) return null

    const property = (job.units as any)?.properties
    if (property?.owner_user_id) {
      for (const id of await notifyLandlordIds(admin, property.owner_user_id)) participants.push({ userId: id, role: 'landlord' })
    }

    // Accepted contractor pushed before tenants/occupants, deliberately: the
    // de-dup below keeps whichever role for a given user id was pushed
    // first, and a user's real role (from account signup) never changes —
    // if the same id also turns up as a tenancy occupant (stale data from
    // before co-renter adds were validated against the real account role),
    // that's the wrong/stale tag and shouldn't be allowed to win just by
    // being pushed first.
    const { data: bid } = await admin.from('bids').select('contractor_user_id').eq('job_id', job.id).eq('status', 'accepted').maybeSingle()
    if (bid?.contractor_user_id) participants.push({ userId: bid.contractor_user_id, role: 'contractor' })

    // SECURITY FIX (external audit, 2026-11-06, TURN-01): "active tenancy
    // on this unit" alone isn't enough — a brand-new tenant is also
    // "active" the moment they're linked, but the job itself may predate
    // their lease entirely (it happened during a previous tenant's
    // occupancy). Require the job to have actually happened on/after the
    // tenancy's own lease_start too, so turnover doesn't hand a new
    // tenant the previous tenant's old job chats.
    const { data: tenancies } = await admin.from('tenancies').select('id, renter_user_id, lease_start').eq('unit_id', job.unit_id).eq('ended', false)
    const currentTenancies = (tenancies || []).filter((t: any) => !t.lease_start || job.created_at >= t.lease_start)
    for (const t of currentTenancies) participants.push({ userId: t.renter_user_id, role: 'renter' })
    if (currentTenancies.length > 0) {
      const { data: occupants } = await admin
        .from('tenancy_occupants')
        .select('renter_user_id')
        .in('tenancy_id', currentTenancies.map((t: any) => t.id))
      for (const o of occupants || []) participants.push({ userId: o.renter_user_id, role: 'renter' })
    }

    context = `About the ${job.category} job${property?.address ? ` at ${property.address}` : ''}`
    path = (role) => `/${role}/jobs/${job.id}#chat`
  } else if (ref.threadId) {
    const { data: thread } = await admin
      .from('dm_threads')
      .select('landlord_user_id, other_user_id, other_role')
      .eq('id', ref.threadId)
      .maybeSingle()
    if (!thread) return null

    for (const id of await notifyLandlordIds(admin, thread.landlord_user_id)) participants.push({ userId: id, role: 'landlord' })
    participants.push({ userId: thread.other_user_id, role: thread.other_role as ChatRole })
    context = 'A direct message'
    path = (role) => `/${role}/messages/${ref.threadId}`
  } else {
    return null
  }

  const seen = new Set<string>()
  const unique = participants.filter((p) => (seen.has(p.userId) ? false : (seen.add(p.userId), true)))
  return { participants: unique, context, path }
}
