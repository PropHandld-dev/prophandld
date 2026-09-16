'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import { ReceiptCard } from '@/components/ReceiptCard'

export default function JobPaymentReceiptPage() {
  const params = useParams()
  const router = useRouter()
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
        <div className="text-white/50">Loading...</div>
      </div>
    )
  }

  if (!receipt || receipt.payment_status !== 'paid') {
    return (
      <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
        <div className="text-white/50 text-sm">Receipt not found.</div>
      </div>
    )
  }

  const job = receipt.jobs as any
  const unit = job?.units
  const property = unit?.properties
  const amount = Number(receipt.proposed_amount ?? receipt.amount)
  const propertyLabel = property?.address
    ? `${property.address}${unit?.unit_number ? ` — Unit ${unit.unit_number}` : ''}`
    : 'Property'

  return (
    <ReceiptCard
      backHref={backHref}
      eyebrow="Job payment receipt"
      title={job?.category || 'Job'}
      subtitle={propertyLabel}
      rows={[
        { label: 'Paid by', value: receipt.landlordName || '—' },
        { label: 'Paid to', value: receipt.contractorName || '—' },
        { label: 'Property', value: property ? `${property.city}, ${property.state}` : '—' },
        { label: 'Job', value: job?.category || '—' },
        { label: 'Paid on', value: receipt.paid_at ? new Date(receipt.paid_at).toLocaleDateString() : '—' },
        { label: 'Method', value: 'Card or bank transfer' },
      ]}
      totalLabel="Amount paid"
      totalValue={`$${amount.toFixed(2)}`}
      receiptId={receipt.id}
      footerNote="Processed via Prophandld · prophandld.com"
    />
  )
}
