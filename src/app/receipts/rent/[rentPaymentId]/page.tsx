'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { RippleButton } from '@/components/RippleButton'

export default function RentReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const rentPaymentId = params.rentPaymentId as string

  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState<any>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
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

  return (
    <div className="min-h-screen bg-[#0C1A2E] py-10 px-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          nav, .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <nav className="max-w-lg mx-auto mb-6 flex items-center justify-between no-print">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          ← Back
        </Link>
        <RippleButton
          onClick={() => window.print()}
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition"
        >
          Print / Save as PDF
        </RippleButton>
      </nav>

      <div className="max-w-lg mx-auto bg-[#0F2138] border border-white/10 rounded-2xl p-8 print:bg-white print:border-black/10 print:text-black">
        <div className="flex items-center gap-2 mb-8">
          <Logo className="w-6 h-6 print:hidden" />
          <span className="text-white font-bold print:text-black">Prophandld</span>
        </div>

        <h1 className="text-xl font-bold text-white print:text-black mb-1">Rent payment receipt</h1>
        <p className="text-white/40 print:text-black/50 text-sm mb-8">{monthLabel}</p>

        <div className="space-y-4 border-t border-white/10 print:border-black/10 pt-6">
          <Row label="Property" value={property?.address ? `${property.address}, ${property.city}, ${property.state}` : '—'} />
          <Row label="Unit" value={unit?.unit_number || '—'} />
          <Row label="Period" value={monthLabel} />
          <Row label="Paid date" value={receipt.paid_date ? new Date(receipt.paid_date + 'T00:00:00').toLocaleDateString() : '—'} />
          <Row label="Payment method" value={receipt.payment_method === 'bank' ? 'Bank transfer (ACH)' : 'Card'} />
        </div>

        <div className="flex items-center justify-between border-t border-white/10 print:border-black/10 mt-6 pt-6">
          <span className="text-white/60 print:text-black/60 text-sm font-medium">Amount paid</span>
          <span className="text-white print:text-black text-2xl font-bold">${Number(receipt.actual_amount).toFixed(2)}</span>
        </div>

        <p className="text-white/25 print:text-black/40 text-xs mt-8">
          Processed via Prophandld · prophandld.com
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40 print:text-black/50 text-sm">{label}</span>
      <span className="text-white print:text-black text-sm font-medium">{value}</span>
    </div>
  )
}
