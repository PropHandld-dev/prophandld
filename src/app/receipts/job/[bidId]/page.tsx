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
          'id, amount, proposed_amount, payment_status, paid_at, contractor_user_id, jobs(category, created_at, units(unit_number, properties(address, city, state, owner_user_id)))'
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
        { label: t('paidOnLabel', lang), value: receipt.paid_at ? new Date(receipt.paid_at).toLocaleDateString(lang === 'es' ? 'es-ES' : undefined) : '—' },
        { label: t('methodLabelReceipt', lang), value: t('cardOrBankTransferValue', lang) },
      ]}
      totalLabel={t('amountPaidLabel', lang)}
      totalValue={`$${amount.toFixed(2)}`}
      receiptId={receipt.id}
      footerNote={t('processedViaFooterNote', lang)}
    />
  )
}
