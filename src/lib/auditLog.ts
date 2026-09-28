import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// A single, general-purpose trail for anything admin-relevant, rather than
// a separate one-off table per event type — "who did what, to whom, when."
// Kept deliberately minimal on what it retains about anyone: enough to
// answer "did this account exist and what happened to it" for support or
// legal purposes (see privacy policy §4 — data tied to a legitimate
// business reason can be retained past account deletion), never a copy of
// their actual profile, documents, messages, or job history, which are
// genuinely erased as they always have been.
export type AuditActionType = 'account_deleted' | 'admin_login' | 'dispute_resolved' | 'contractor_verification_decision'

export async function logAdminAudit({
  actionType,
  actorUserId,
  actorEmail,
  targetUserId,
  targetEmail,
  targetRole,
  detail,
}: {
  actionType: AuditActionType
  actorUserId?: string | null
  actorEmail?: string | null
  targetUserId?: string | null
  targetEmail?: string | null
  targetRole?: string | null
  detail?: Record<string, any>
}) {
  const { error } = await getSupabaseAdmin().from('admin_audit_log').insert({
    action_type: actionType,
    actor_user_id: actorUserId || null,
    actor_email: actorEmail || null,
    target_user_id: targetUserId || null,
    target_email: targetEmail || null,
    target_role: targetRole || null,
    detail: detail || {},
  })
  // Never let a logging failure block the real action (a deletion, a
  // resolution) — log it server-side so it's at least diagnosable, same
  // fire-and-log pattern used for every other non-critical side effect
  // in this app.
  if (error) console.error('logAdminAudit: could not write audit entry', { actionType, error })
}
