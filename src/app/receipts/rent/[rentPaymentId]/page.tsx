'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ReceiptCard } from '@/components/ReceiptCard'
import { useLanguage, t } from '@/lib/i18n'

export default function RentReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const lang = useLanguage()
  const rentPaymentId = params.rentPaymentId as string

  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState<any>(null)
  const [backHref, setBackHref] = useState('/landlord')
  // A card surcharge is real money to the renter (it's what left their
  // card) but invisible to the landlord (their payout was always exactly
  // the base rent, application_fee_amount already took the surcharge out
  // before the transfer). Same receipt row, two honest totals depending on
  // who's looking at it — never show the landlord a number bigger than
  // what actually landed in their account.
  const [isRenterViewer, setIsRenterViewer] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data } = await supabase
        .from('rent_payments')
        .select(
          'id, month, expected_amount, actual_amount, card_surcharge_amount, water_amount, paid_date, payment_method, stripe_status, tenancies(renter_user_id, units(unit_number, properties(address, city, state, owner_user_id)))'
        )
        .eq('id', rentPaymentId)
        .maybeSingle()

      const tenancyRow = data?.tenancies as any
      const renterId = tenancyRow?.renter_user_id
      const landlordId = tenancyRow?.units?.properties?.owner_user_id

      const [{ data: renterData }, { data: landlordData }] = await Promise.all([
        renterId ? supabase.rpc('get_user_by_id', { user_id_input: renterId }).maybeSingle() : Promise.resolve({ data: null }),
        landlordId ? supabase.rpc('get_user_by_id', { user_id_input: landlordId }).maybeSingle() : Promise.resolve({ data: null }),
      ])

      setReceipt(data ? { ...data, renterName: (renterData as any)?.full_name, landlordName: (landlordData as any)?.full_name } : data)
      setIsRenterViewer(renterId === user.id)
      setBackHref(renterId === user.id ? '/renter/rent' : '/landlord')
      setLoading(false)
    }
    init()
  }, [rentPaymentId, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50">{t('loadingEllipsisPlain', lang)}</div>
      </div>
    )
  }

  if (!receipt || !receipt.actual_amount) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50 text-sm">{t('receiptNotFound', lang)}</div>
      </div>
    )
  }

  const tenancy = receipt.tenancies as any
  const unit = tenancy?.units
  const property = unit?.properties
  const monthLabel = new Date(receipt.month + 'T00:00:00').toLocaleDateString(lang === 'es' ? 'es-ES' : undefined, { month: 'long', year: 'numeric' })
  const unitLabel = property?.address
    ? `${property.address}${unit?.unit_number ? `, Unit ${unit.unit_number}` : ''}`
    : t('unitFallback', lang)
  const surcharge = isRenterViewer ? Number(receipt.card_surcharge_amount || 0) : 0
  const totalCharged = Number(receipt.actual_amount) + surcharge

  return (
    <ReceiptCard
      backHref={backHref}
      eyebrow={t('rentReceiptEyebrow', lang)}
      title={unitLabel}
      subtitle={monthLabel}
      rows={[
        { label: t('paidByLabel', lang), value: receipt.renterName || '—' },
        { label: t('paidToLabel', lang), value: receipt.landlordName || '—' },
        { label: t('propertyLabel', lang), value: property ? `${property.city}, ${property.state}` : '—' },
        { label: t('periodLabel', lang), value: monthLabel },
        ...(receipt.water_amount
          ? [
              { label: t('rentWord', lang), value: `$${(Number(receipt.expected_amount) - Number(receipt.water_amount)).toFixed(2)}` },
              { label: t('waterWord', lang), value: `$${Number(receipt.water_amount).toFixed(2)}` },
            ]
          : []),
        // Only shown when it's actually nonzero — a bank payment (the
        // overwhelming majority) never had one, and the row would just be
        // visual noise repeating "$0.00" on every receipt otherwise.
        ...(surcharge > 0 ? [{ label: t('cardProcessingFeeLabel', lang), value: `$${surcharge.toFixed(2)}` }] : []),
        { label: t('paidOnLabel', lang), value: receipt.paid_date ? new Date(receipt.paid_date + 'T00:00:00').toLocaleDateString(lang === 'es' ? 'es-ES' : undefined) : '—' },
        { label: t('methodLabelReceipt', lang), value: receipt.payment_method === 'bank' ? t('bankTransferValue', lang) : t('debitCardValue', lang) },
      ]}
      totalLabel={t('amountPaidLabel', lang)}
      totalValue={`$${totalCharged.toFixed(2)}`}
      receiptId={receipt.id}
      footerNote={t('processedViaFooterNote', lang)}
    />
  )
}
