'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ReceiptCard } from '@/components/ReceiptCard'
import { useLanguage, t } from '@/lib/i18n'

export default function JobPaymentReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const lang = useLanguage()
  const bidId = params.bidId as string

  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState<any>(null)
  const [backHref, setBackHref] = useState('/landlord')
  // The surcharge is only ever real to the landlord who paid it — the
  // contractor received exactly the base bid amount either way, and
  // should never see a receipt implying otherwise.
  const [isLandlordViewer, setIsLandlordViewer] = useState(false)

  // Caught live by an external audit: a receipt left open in a background
  // tab kept showing names, property and payment details after signing
  // out in another tab, until that tab happened to be refreshed. The
  // one-shot getUser() check above only ever runs once on mount — this
  // reacts to the session actually changing later, in this same tab.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setReceipt(null)
        router.replace('/login')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data } = await supabase
        .from('bids')
        .select(
          'id, amount, proposed_amount, card_surcharge_amount, payment_status, paid_at, payment_method, contractor_user_id, jobs(category, created_at, units(unit_number, properties(address, city, state, owner_user_id)))'
        )
        .eq('id', bidId)
        .maybeSingle()

      const job = data?.jobs as any
      const landlordId = job?.units?.properties?.owner_user_id
      const contractorId = data?.contractor_user_id

      const [{ data: contractorData }, { data: landlordData }] = await Promise.all([
        contractorId ? supabase.rpc('get_user_by_id', { user_id_input: contractorId }).maybeSingle() : Promise.resolve({ data: null }),
        landlordId ? supabase.rpc('get_user_by_id', { user_id_input: landlordId }).maybeSingle() : Promise.resolve({ data: null }),
      ])

      setReceipt(data ? { ...data, contractorName: (contractorData as any)?.full_name, landlordName: (landlordData as any)?.full_name } : data)
      setBackHref(contractorId === user.id ? '/contractor' : '/landlord')
      setIsLandlordViewer(landlordId === user.id)
      setLoading(false)
    }
    init()
  }, [bidId, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50">{t('loadingEllipsisPlain', lang)}</div>
      </div>
    )
  }

  if (!receipt || receipt.payment_status !== 'paid') {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50 text-sm">{t('receiptNotFound', lang)}</div>
      </div>
    )
  }

  const job = receipt.jobs as any
  const unit = job?.units
  const property = unit?.properties
  const amount = Number(receipt.amount)
  const surcharge = isLandlordViewer ? Number(receipt.card_surcharge_amount || 0) : 0
  const totalCharged = amount + surcharge
  const propertyLabel = property?.address
    ? `${property.address}${unit?.unit_number ? `, Unit ${unit.unit_number}` : ''}`
    : t('propertyFallback', lang)

  return (
    <ReceiptCard
      backHref={backHref}
      eyebrow={t('jobPaymentReceiptEyebrow', lang)}
      title={job?.category || t('jobFallback', lang)}
      subtitle={propertyLabel}
      rows={[
        { label: t('paidByLabel', lang), value: receipt.landlordName || '—' },
        { label: t('paidToLabel', lang), value: receipt.contractorName || '—' },
        { label: t('propertyLabel', lang), value: property ? `${property.city}, ${property.state}` : '—' },
        { label: t('jobLabel', lang), value: job?.category || '—' },
        // Only shown when it's actually nonzero — both bank transfer and
        // card carry a processing fee here — and only to the landlord, who
        // paid it; the contractor's own receipt never mentions it, since
        // they received exactly the bid amount.
        ...(surcharge > 0 ? [{ label: t('cardProcessingFeeLabel', lang), value: `$${surcharge.toFixed(2)}` }] : []),
        // Caught live by an external audit (PAY-04): this read paid_at in
        // the viewer's own browser timezone, while the financial report
        // (landlord/reports/page.tsx) always reads its UTC calendar date —
        // an evening payment in the US could show one date here and the
        // next day's date there. Matching the report's own convention
        // instead of introducing a third one.
        { label: t('paidOnLabel', lang), value: receipt.paid_at ? new Date(receipt.paid_at.slice(0, 10) + 'T00:00:00').toLocaleDateString(lang === 'es' ? 'es-ES' : undefined) : '—' },
        // Caught live by an external audit (PAY-03): this always showed
        // the same generic placeholder regardless of which was actually
        // used — see the webhook/confirm-route note for why `bids` didn't
        // record it until now. Same per-method labels rent receipts
        // already use.
        {
          label: t('methodLabelReceipt', lang),
          value:
            receipt.payment_method === 'card' ? t('debitCardValue', lang)
            : receipt.payment_method === 'bank' ? t('bankTransferValue', lang)
            : t('cardOrBankTransferValue', lang),
        },
      ]}
      totalLabel={t('amountPaidLabel', lang)}
      totalValue={`$${totalCharged.toFixed(2)}`}
      receiptId={receipt.id}
      footerNote={t('processedViaFooterNote', lang)}
    />
  )
}
