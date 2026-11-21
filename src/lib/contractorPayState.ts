import { t, type Lang } from '@/lib/i18n'

// One answer to "where's my money?" for a contractor's accepted bid, used by
// Home, Earnings and the job page so they never disagree (QA PAY-10: the
// same $272 read "awaiting landlord approval" on Home and "Pending" under
// "Awaiting payment" in Earnings). Approval and payment are separate steps:
// the landlord approves the work, then pays.
export type PayState = 'working' | 'awaiting_approval' | 'approved_unpaid' | 'processing' | 'paid'

export function contractorPayState(bid: { payment_status?: string | null; jobs?: { status?: string | null } | null }): PayState {
  if (bid.payment_status === 'paid') return 'paid'
  if (bid.payment_status === 'processing') return 'processing'
  const s = bid.jobs?.status
  if (s === 'pending_review') return 'awaiting_approval'
  if (s === 'completed' || s === 'archived') return 'approved_unpaid'
  return 'working'
}

export function payStateLabel(state: PayState, lang: Lang): string {
  return t(
    state === 'paid' ? 'payStatePaid' : state === 'processing' ? 'payStateProcessing' : state === 'approved_unpaid' ? 'payStateApprovedUnpaid' : state === 'awaiting_approval' ? 'payStateAwaitingApproval' : 'payStateWorking',
    lang,
  )
}

export const PAY_STATE_TONE: Record<PayState, string> = {
  paid: 'text-[#12A5A9]',
  processing: 'text-[#12A5A9]/80',
  approved_unpaid: 'text-yellow-400/90',
  awaiting_approval: 'text-white/55',
  working: 'text-white/45',
}
