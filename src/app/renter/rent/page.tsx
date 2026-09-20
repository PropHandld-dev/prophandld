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
import { CheckCircleIcon, CalendarIcon, FileTextIcon } from '@/components/icons'
import { RENTER_TABS } from '@/lib/navTabs'
import { ensureCurrentMonthRentPayment, ensureNextMonthRentPayment } from '@/lib/rentAutomation'

const DAY_MS = 24 * 60 * 60 * 1000

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const ordinal = (day: number) => {
  if (day % 10 === 1 && day !== 11) return `${day}st`
  if (day % 10 === 2 && day !== 12) return `${day}nd`
  if (day % 10 === 3 && day !== 13) return `${day}rd`
  return `${day}th`
}

export default function RenterRentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tenancy, setTenancy] = useState<any>(null)
  const [unitLabel, setUnitLabel] = useState<string | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ clientSecret: string; amount: number; rentPaymentId: string } | null>(null)

  const loadPayments = async (tenancyId: string) => {
    const { data, error: paymentsError } = await supabase
      .from('rent_payments')
      .select('*, documents(filename, file_url)')
      .eq('tenancy_id', tenancyId)
      .order('month', { ascending: false })

    if (paymentsError) {
      console.error('Error loading rent payments:', paymentsError)
      return
    }

    const enriched = await Promise.all(
      (data || []).map(async (payment) => {
        if (!payment.documents) return payment
        const { data: signedUrlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(payment.documents.file_url, 3600)
        return { ...payment, waterBillViewUrl: signedUrlData?.signedUrl }
      })
    )

    setPayments(enriched)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      // Resolves to the caller's tenancy whether they're the primary
      // tenant or a co-renter added on the unit (tenancy_occupants) —
      // rent is one shared amount for the household either way.
      const { data: tenancyId } = await supabase.rpc('get_my_active_tenancy_id')
      const { data: tenancyData } = tenancyId
        ? await supabase.from('tenancies').select('*').eq('id', tenancyId).maybeSingle()
        : { data: null }

      if (!tenancyData) {
        setLoading(false)
        return
      }
      setTenancy(tenancyData)

      const [, , unitResult] = await Promise.all([
        ensureCurrentMonthRentPayment(supabase, tenancyData.id, tenancyData.rent_amount),
        ensureNextMonthRentPayment(supabase, tenancyData.id, tenancyData.rent_amount),
        supabase.from('units').select('unit_number, properties(address, city)').eq('id', tenancyData.unit_id).maybeSingle(),
      ])
      const unit: any = unitResult?.data
      if (unit?.properties?.address) {
        setUnitLabel(`${unit.properties.address}${unit.unit_number ? `, Unit ${unit.unit_number}` : ''}`)
      }

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

  const isPaid = (payment: any) => {
    const expected = Number(payment.expected_amount) || 0
    return expected > 0 && Number(payment.actual_amount || 0) >= expected
  }

  const getDueDate = (payment: any) => {
    const monthDate = new Date(payment.month + 'T00:00:00')
    return new Date(monthDate.getFullYear(), monthDate.getMonth(), tenancy?.rent_due_day || 1)
  }

  const getDaysUntilDue = (payment: any) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((getDueDate(payment).getTime() - today.getTime()) / DAY_MS)
  }

  const isUpcomingMonth = (payment: any) => {
    const today = new Date()
    const monthDate = new Date(payment.month + 'T00:00:00')
    return monthDate.getFullYear() > today.getFullYear() ||
      (monthDate.getFullYear() === today.getFullYear() && monthDate.getMonth() > today.getMonth())
  }

  const formatMonth = (month: string) =>
    new Date(month + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const formatDue = (payment: any) =>
    getDueDate(payment).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  const dueText = (payment: any) => {
    const days = getDaysUntilDue(payment)
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} late`
    if (days === 0) return 'Due today'
    return `Due in ${days} day${days === 1 ? '' : 's'}`
  }

  const unpaid = payments.filter((p) => !isPaid(p)).sort((a, b) => a.month.localeCompare(b.month))
  const paid = payments.filter(isPaid)
  const heroPayment = unpaid.find((p) => !isUpcomingMonth(p)) ?? null
  const nextUp = heroPayment ? null : unpaid[0] ?? null
  const otherUnpaid = unpaid.filter((p) => p.id !== heroPayment?.id && p.id !== nextUp?.id)

  const breakdown = (payment: any) => {
    const expected = Number(payment.expected_amount) || 0
    const water = Number(payment.water_amount || 0)
    const lateFee = payment.late_fee_applied ? Number(tenancy?.late_fee_amount || 0) : 0
    return { rent: expected - water - lateFee, water, lateFee, paidSoFar: Number(payment.actual_amount || 0) }
  }

  const renderHero = (payment: any) => {
    const days = getDaysUntilDue(payment)
    const late = days < 0
    const { rent, water, lateFee, paidSoFar } = breakdown(payment)
    const amountDue = Number(payment.expected_amount) - paidSoFar
    const pct = late ? 100 : Math.max(4, Math.min(100, ((30 - days) / 30) * 100))
    const tone = late
      ? { pill: 'bg-red-500/15 text-red-400', bar: 'bg-red-400', ring: 'border-red-500/30' }
      : days <= 3
        ? { pill: 'bg-yellow-500/15 text-yellow-400', bar: 'bg-yellow-400', ring: 'border-yellow-500/30' }
        : { pill: 'bg-[#12A5A9]/15 text-[#12A5A9]', bar: 'bg-[#12A5A9]', ring: 'border-[#12A5A9]/30' }

    return (
      <div className={`bg-gradient-to-br from-white/6 to-white/2 border ${tone.ring} rounded-3xl p-6 mb-6`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-white/60 text-sm">{formatMonth(payment.month)} rent</p>
          <span className={`text-xs font-semibold rounded-full px-3 py-1 ${tone.pill}`}>{dueText(payment)}</span>
        </div>

        <p className="text-white text-4xl font-bold tracking-tight mt-3 tabular-nums">{money(amountDue)}</p>
        <p className="text-white/50 text-sm mt-1 flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5" />
          Due {formatDue(payment)}
        </p>

        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden mt-5" aria-hidden="true">
          <div className={`h-full rounded-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between text-white/70">
            <span>Rent</span>
            <span className="tabular-nums">{money(rent)}</span>
          </div>
          {water > 0 && (
            <div className="flex justify-between text-white/70">
              <span className="flex items-center gap-2">
                Water
                {payment.waterBillViewUrl && (
                  <a
                    href={payment.waterBillViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#12A5A9] text-xs hover:underline"
                  >
                    <FileTextIcon className="w-3 h-3" /> View bill
                  </a>
                )}
              </span>
              <span className="tabular-nums">{money(water)}</span>
            </div>
          )}
          {lateFee > 0 && (
            <div className="flex justify-between text-yellow-400">
              <span>Late fee</span>
              <span className="tabular-nums">{money(lateFee)}</span>
            </div>
          )}
          {paidSoFar > 0 && (
            <div className="flex justify-between text-[#12A5A9]">
              <span>Already paid</span>
              <span className="tabular-nums">−{money(paidSoFar)}</span>
            </div>
          )}
          <div className="flex justify-between text-white font-semibold pt-2 border-t border-white/10">
            <span>Total due</span>
            <span className="tabular-nums">{money(amountDue)}</span>
          </div>
        </div>

        <RippleButton
          onClick={() => handlePayNow(payment)}
          disabled={payingId === payment.id}
          className="w-full mt-6 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3.5 rounded-2xl hover:opacity-90 transition disabled:opacity-50"
        >
          {payingId === payment.id ? 'Loading...' : `Pay ${money(amountDue)}`}
        </RippleButton>
        <p className="text-white/50 text-xs text-center mt-3">Debit card or bank account, straight to your landlord.</p>
      </div>
    )
  }

  const renderUpcomingRow = (payment: any, primary: boolean) => {
    const amountDue = Number(payment.expected_amount) - Number(payment.actual_amount || 0)
    const upcoming = isUpcomingMonth(payment)
    return (
      <div key={payment.id} className="bg-white/3 border border-white/8 rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-white font-semibold">{formatMonth(payment.month)}</p>
          <p className="text-white/50 text-xs mt-0.5">
            {upcoming ? `Due ${formatDue(payment)}` : dueText(payment)}
            {payment.water_amount ? ` · incl. ${money(Number(payment.water_amount))} water` : ''}
          </p>
          {payment.waterBillViewUrl && (
            <a
              href={payment.waterBillViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#12A5A9] text-xs hover:underline mt-1 inline-block"
            >
              View water bill →
            </a>
          )}
        </div>
        <RippleButton
          onClick={() => handlePayNow(payment)}
          disabled={payingId === payment.id}
          className={`shrink-0 text-xs font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-50 ${
            primary
              ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white hover:opacity-90'
              : 'bg-white/8 text-white hover:bg-white/12'
          }`}
        >
          {payingId === payment.id ? 'Loading...' : upcoming ? `Pay early ${money(amountDue)}` : `Pay ${money(amountDue)}`}
        </RippleButton>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          ← Back
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-12" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-7 w-24 mb-2" />
            <Skeleton className="h-72 rounded-3xl mb-6" />
            <Skeleton className="h-20" />
          </div>
        ) : !tenancy ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">No active lease linked to your account yet.</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Rent</h1>
              <p className="text-white/50 text-sm mt-1">
                {unitLabel ? `${unitLabel} · ` : ''}
                {tenancy.rent_amount ? `${money(Number(tenancy.rent_amount))}/month, due the ${ordinal(tenancy.rent_due_day || 1)}` : ''}
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
                {error}
              </div>
            )}

            {payments.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
                <p className="text-white/50 text-sm">Nothing to pay yet. Check back once your lease&apos;s rent amount is set up.</p>
              </div>
            ) : (
              <>
                {heroPayment ? (
                  renderHero(heroPayment)
                ) : (
                  <div className="bg-[#0A7B7E]/12 border border-[#12A5A9]/30 rounded-3xl p-6 mb-6">
                    <p className="text-[#12A5A9] font-semibold flex items-center gap-2">
                      <CheckCircleIcon className="w-5 h-5" /> You&apos;re all paid up
                    </p>
                    <p className="text-white/60 text-sm mt-1">
                      {nextUp
                        ? `Next up: ${formatMonth(nextUp.month)}, due ${formatDue(nextUp)}.`
                        : 'Nothing due right now.'}
                    </p>
                  </div>
                )}

                {(nextUp || otherUnpaid.length > 0) && (
                  <section className="mb-8">
                    <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-3">
                      {heroPayment ? 'Coming up' : 'Pay ahead if you like'}
                    </h2>
                    <ScrollReveal className="space-y-3">
                      {nextUp && renderUpcomingRow(nextUp, true)}
                      {otherUnpaid.map((p) => renderUpcomingRow(p, false))}
                    </ScrollReveal>
                  </section>
                )}

                {paid.length > 0 && (
                  <section>
                    <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-3">Payment history</h2>
                    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl divide-y divide-white/8">
                      {paid.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium">{formatMonth(payment.month)}</p>
                            <p className="text-white/50 text-xs mt-0.5">
                              {payment.paid_date ? `Paid ${new Date(payment.paid_date + 'T00:00:00').toLocaleDateString()}` : 'Paid'}
                              {payment.water_amount ? ` · incl. ${money(Number(payment.water_amount))} water` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-white text-sm tabular-nums">{money(Number(payment.actual_amount))}</span>
                            <Link href={`/receipts/rent/${payment.id}`} className="text-[#12A5A9] text-xs font-semibold hover:underline">
                              Receipt
                            </Link>
                          </div>
                        </div>
                      ))}
                    </ScrollReveal>
                  </section>
                )}

                <p className="text-white/50 text-xs mt-8">
                  Credit cards aren&apos;t accepted for rent. Bank payments (ACH) can take a few business days to clear; debit card payments are instant.
                </p>
              </>
            )}
          </>
        )}
      </main>

      {modal && (
        <StripePaymentModal
          clientSecret={modal.clientSecret}
          amount={modal.amount}
          title="Pay rent"
          note="Debit card or bank account only. Credit cards aren't accepted for rent and will be refunded. Bank payments may take a few business days to clear."
          onClose={() => setModal(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}
