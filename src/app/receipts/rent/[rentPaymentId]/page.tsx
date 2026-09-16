'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ReceiptCard } from '@/components/ReceiptCard'

export default function RentReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const rentPaymentId = params.rentPaymentId as string

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
        .from('rent_payments')
        .select(
          'id, month, expected_amount, actual_amount, paid_date, payment_method, stripe_status, tenancies(renter_user_id, units(unit_number, properties(address, city, state, owner_user_id)))'
        )
        .eq('id', rentPaymentId)
        .maybeSingle()

      setReceipt(data)
      const tenancyRow = data?.tenancies as any
      setBackHref(tenancyRow?.renter_user_id === user.id ? '/renter/rent' : '/landlord')
      setLoading(false)
    }
    init()
  }, [rentPaymentId, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    )
  }

  if (!receipt || !receipt.actual_amount) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50 text-sm">Receipt not found.</div>
      </div>
    )
  }

  const tenancy = receipt.tenancies as any
  const unit = tenancy?.units
  const property = unit?.properties
  const monthLabel = new Date(receipt.month + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const unitLabel = property?.address
    ? `${property.address}${unit?.unit_number ? ` — Unit ${unit.unit_number}` : ''}`
    : 'Unit'

  return (
    <ReceiptCard
      backHref={backHref}
      eyebrow="Rent receipt"
      title={unitLabel}
      subtitle={monthLabel}
      rows={[
        { label: 'Property', value: property ? `${property.city}, ${property.state}` : '—' },
        { label: 'Period', value: monthLabel },
        { label: 'Paid', value: receipt.paid_date ? new Date(receipt.paid_date + 'T00:00:00').toLocaleDateString() : '—' },
        { label: 'Method', value: receipt.payment_method === 'bank' ? 'Bank transfer' : 'Debit card' },
      ]}
      totalLabel="Amount paid"
      totalValue={`$${Number(receipt.actual_amount).toFixed(2)}`}
      receiptId={receipt.id}
      footerNote="Processed via Prophandld · prophandld.com"
    />
  )
}
