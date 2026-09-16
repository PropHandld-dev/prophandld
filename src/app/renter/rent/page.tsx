'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { StripePaymentModal } from '@/components/StripePaymentModal'
import { RENTER_TABS } from '@/lib/navTabs'
import { ensureCurrentMonthRentPayment } from '@/lib/rentAutomation'

export default function RenterRentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tenancy, setTenancy] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ clientSecret: string; amount: number; rentPaymentId: string } | null>(null)

  const loadPayments = async (tenancyId: string) => {
    const { data, error: paymentsError } = await supabase
      .from('rent_payments')
      .select('*')
      .eq('tenancy_id', tenancyId)
      .order('month', { ascending: false })

    if (paymentsError) {
      console.error('Error loading rent payments:', paymentsError)
      return
    }
    setPayments(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: tenancyData } = await supabase
        .from('tenancies')
        .select('*')
        .eq('renter_user_id', user.id)
        .eq('ended', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!tenancyData) {
        setLoading(false)
        return
      }
      setTenancy(tenancyData)
      await ensureCurrentMonthRentPayment(supabase, tenancyData.id, tenancyData.rent_amount)
      await loadPayments(tenancyData.id)
      setLoading(false)
    }
    init()
  }, [router])

  const handlePayNow = async (payment: any) => {
    setPayingId(payment.id)
    setError(null)

    try {
      const res = await fetch('/api/stripe/rent/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentPaymentId: payment.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) {
        setError(data.error || 'Could not start payment.')
        setPayingId(null)
        return
      }
      setModal({ clientSecret: data.clientSecret, amount: data.amount, rentPaymentId: payment.id })
    } catch {
      setError('Could not start payment.')
    }
    setPayingId(null)
  }

  const handlePaymentSuccess = async () => {
    setModal(null)
    if (tenancy) await loadPayments(tenancy.id)
  }

  const getStatus = (payment: any) => {
    const expected = payment.expected_amount || 0
    const actual = payment.actual_amount || 0
    if (actual >= expected && expected > 0) {
      return { label: 'Paid', color: 'bg-[#12A5A9]/15 text-[#12A5A9]' }
    }
    const today = new Date()
    today.setDate(1)
    today.setHours(0, 0, 0, 0)
    const monthDate = new Date(payment.month + 'T00:00:00')
    if (monthDate < today) {
      return { label: 'Late', color: 'bg-red-500/15 text-red-400' }
    }
    return { label: 'Due', color: 'bg-yellow-500/15 text-yellow-400' }
  }

  const formatMonth = (month: string) =>
    new Date(month + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          ← Back
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-12" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-7 w-24 mb-2" />
            <Skeleton className="h-20 mb-6" />
            <Skeleton className="h-20" />
          </div>
        ) : !tenancy ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No active lease linked to your account yet.</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white">Pay rent</h1>
              <p className="text-white/50 text-sm mt-1">Pay by debit card or bank account, straight to your landlord.</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
                {error}
              </div>
            )}

            {payments.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
                <p className="text-white/30 text-sm">Nothing to pay yet — check back once your lease&apos;s rent amount is set up.</p>
              </div>
            ) : (
              <ScrollReveal className="space-y-3">
                {payments.map((payment) => {
                  const status = getStatus(payment)
                  const amountDue = Number(payment.expected_amount) - Number(payment.actual_amount || 0)
                  return (
                    <div key={payment.id} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-white font-semibold">{formatMonth(payment.month)}</h3>
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            <span className={`text-xs rounded-full px-2.5 py-0.5 ${status.color}`}>
                              {status.label}
                            </span>
                            <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                              ${payment.actual_amount ?? 0} of ${payment.expected_amount}
                            </span>
                          </div>
                        </div>
                        {status.label !== 'Paid' ? (
                          <RippleButton
                            onClick={() => handlePayNow(payment)}
                            disabled={payingId === payment.id}
                            className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                          >
                            {payingId === payment.id ? 'Loading...' : `Pay $${amountDue.toFixed(2)}`}
                          </RippleButton>
                        ) : (
                          <Link href={`/receipts/rent/${payment.id}`} className="shrink-0 text-[#12A5A9] text-xs font-semibold hover:underline">
                            Receipt
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </ScrollReveal>
            )}

            <p className="text-white/30 text-xs mt-6">
              Debit card or bank account only — credit cards aren&apos;t accepted for rent. Bank payments (ACH) can take a few business days to clear; debit card payments are instant.
            </p>
          </>
        )}
      </main>

      {modal && (
        <StripePaymentModal
          clientSecret={modal.clientSecret}
          amount={modal.amount}
          title="Pay rent"
          note="Debit card or bank account only — credit cards aren't accepted for rent and will be refunded. Bank payments may take a few business days to clear."
          onClose={() => setModal(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}
