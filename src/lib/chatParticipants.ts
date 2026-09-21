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
      .select('id, category, unit_id, units(properties(address, owner_user_id))')
      .eq('id', ref.jobId)
      .maybeSingle()
    if (!job) return null

    const property = (job.units as any)?.properties
    if (property?.owner_user_id) participants.push({ userId: property.owner_user_id, role: 'landlord' })

    const { data: tenancies } = await admin.from('tenancies').select('id, renter_user_id').eq('unit_id', job.unit_id).eq('ended', false)
    for (const t of tenancies || []) participants.push({ userId: t.renter_user_id, role: 'renter' })
    if ((tenancies || []).length > 0) {
      const { data: occupants } = await admin
        .from('tenancy_occupants')
        .select('renter_user_id')
        .in('tenancy_id', (tenancies || []).map((t: any) => t.id))
      for (const o of occupants || []) participants.push({ userId: o.renter_user_id, role: 'renter' })
    }

    const { data: bid } = await admin.from('bids').select('contractor_user_id').eq('job_id', job.id).eq('status', 'accepted').maybeSingle()
    if (bid?.contractor_user_id) participants.push({ userId: bid.contractor_user_id, role: 'contractor' })

    context = `About the ${job.category} job${property?.address ? ` at ${property.address}` : ''}`
    path = (role) => `/${role}/jobs/${job.id}#chat`
  } else if (ref.threadId) {
    const { data: thread } = await admin
      .from('dm_threads')
      .select('landlord_user_id, other_user_id, other_role')
      .eq('id', ref.threadId)
      .maybeSingle()
    if (!thread) return null

    participants.push({ userId: thread.landlord_user_id, role: 'landlord' })
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
