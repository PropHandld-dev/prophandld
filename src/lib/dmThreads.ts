import { supabase } from '@/lib/supabase'

export type DmContact = {
  other_user_id: string
  other_role: 'renter' | 'contractor' | 'landlord'
  full_name: string | null
  context_label: string | null
  last_job_category: string | null
  last_job_completed_at: string | null
  thread_id: string | null
}

const ROLE_LABELS: Record<string, string> = {
  renter: 'Tenant',
  contractor: 'Contractor',
  landlord: 'Landlord',
}

export type StartedConversation = {
  threadId: string
  otherName: string
  otherRole: string
  initialDraft: string
}

// Shared by the contacts strip and the full picker so both start a thread
// the same way. myRole tells us which side of the pair the caller is on,
// since the RPCs accept either the landlord or the tenant/contractor as
// the caller as long as they're one of the two ids and the relationship
// checks out server-side.
export async function startDmThread(myRole: 'landlord' | 'renter' | 'contractor', contact: DmContact): Promise<StartedConversation> {
  const name = contact.full_name || 'Unknown'
  const firstName = name.split(' ')[0]
  const initialDraft = contact.last_job_category
    ? `Hi ${firstName}, I have another ${contact.last_job_category.toLowerCase()} issue. Are you available?`
    : ''

  let threadId = contact.thread_id

  if (!threadId) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not signed in')

    const { data, error: startError } =
      myRole === 'landlord'
        ? contact.other_role === 'renter'
          ? await supabase.rpc('start_landlord_tenant_thread', { p_landlord_user_id: user.id, p_renter_user_id: contact.other_user_id })
          : await supabase.rpc('start_landlord_contractor_thread', { p_landlord_user_id: user.id, p_contractor_user_id: contact.other_user_id })
        : myRole === 'renter'
          ? await supabase.rpc('start_landlord_tenant_thread', { p_landlord_user_id: contact.other_user_id, p_renter_user_id: user.id })
          : await supabase.rpc('start_landlord_contractor_thread', { p_landlord_user_id: contact.other_user_id, p_contractor_user_id: user.id })

    if (startError || !data) throw startError || new Error('Could not start conversation')
    threadId = data as string
  }

  return { threadId, otherName: name, otherRole: ROLE_LABELS[contact.other_role] || contact.other_role, initialDraft }
}

// A prefilled draft (e.g. the rehire starter message) can't travel through
// a full-page navigation as component state, so callers stash it in
// sessionStorage keyed by thread id; the thread page pops it once on mount.
export function popStashedDraft(threadId: string): string {
  if (typeof window === 'undefined') return ''
  const key = `dm-draft:${threadId}`
  const value = sessionStorage.getItem(key) || ''
  if (value) sessionStorage.removeItem(key)
  return value
}
