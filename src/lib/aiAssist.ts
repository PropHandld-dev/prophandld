// Client-safe — mirrors the NEXT_PUBLIC_BILLING_ENFORCE pattern in
// useBillingStatus.ts. Off by default: this whole add-on is billing
// plumbing only, built ahead of the team's sign-off on the AI features PDF
// proposal, so no real landlord can see or pay for it until this env var is
// deliberately turned on post-decision. Checked both client-side (hide the
// card) and server-side (refuse the API routes even if someone finds them).
export const AI_ASSIST_ENABLED = process.env.NEXT_PUBLIC_AI_ASSIST_ENABLED === 'on'

export type AiAssistStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled'

// The one gate every actual AI feature route checks (document extraction,
// lease Q&A, etc.) — server-only, takes an already-built admin client so
// callers that already have one don't open a second connection. A landlord
// has access while trialing (even if the trial clock has technically run
// out — Stripe's own invoice/dunning flow is what actually revokes access
// on non-payment, not this check), while genuinely active, or while
// admin-granted free_forever, but never once status is past_due, canceled,
// or they've never started at all.
export async function hasAiAssistAccess(
  supabaseAdmin: { from: (table: string) => any },
  landlordUserId: string
): Promise<boolean> {
  if (!AI_ASSIST_ENABLED) return false
  const { data } = await supabaseAdmin
    .from('ai_assist_subscriptions')
    .select('status, free_forever')
    .eq('landlord_user_id', landlordUserId)
    .maybeSingle()
  if (!data) return false
  if (data.free_forever) return true
  return data.status === 'trialing' || data.status === 'active'
}
