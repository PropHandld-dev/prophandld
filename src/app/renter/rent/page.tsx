'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
// Pulls in @stripe/react-stripe-js, only ever needed once a payment
// actually starts — most visits to this page are just checking rent
// status, not paying, so there's no reason to ship that into every
// visit's own JS chunk.
const StripePaymentModal = dynamic(() => import('@/components/StripePaymentModal').then((m) => m.StripePaymentModal), { ssr: false })
import { CheckCircleIcon, CalendarIcon, FileTextIcon } from '@/components/icons'
import { RENTER_TABS } from '@/lib/navTabs'
import { ensureCurrentMonthRentPayment, ensureNextMonthRentPayment } from '@/lib/rentAutomation'
import { cardProcessingFee } from '@/lib/cardSurcharge'
import { useLanguage, t, type Lang } from '@/lib/i18n'

const DAY_MS = 24 * 60 * 60 * 1000

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const ordinal = (day: number) => {
  if (day % 10 === 1 && day !== 11) return `${day}st`
  if (day % 10 === 2 && day !== 12) return `${day}nd`
  if (day % 10 === 3 && day !== 13) return `${day}rd`
  return `${day}th`
}

// "due the 1st" in English reads naturally as "vence el día 1" in Spanish —
// a translated ordinal suffix ("1ro", "2do") isn't how Spanish actually
// phrases a due date, so this branches per language instead of forcing the
// English ordinal pattern through translated words.
const dueDayPhrase = (day: number, lang: Lang) =>
  lang === 'es' ? `vence el día ${day}` : `due the ${ordinal(day)}`

export default function RenterRentPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [tenancy, setTenancy] = useState<any>(null)
  const [unitLabel, setUnitLabel] = useState<string | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ clientSecret: string; amount: number; rentPaymentId: string } | null>(null)
  const [methodChoicePayment, setMethodChoicePayment] = useState<any>(null)
  // 'all' by default — a tenant's own history rarely spans enough years for
  // filtering to matter the way it does for a landlord's whole portfolio,
  // so this defaults open rather than defaulting to "this year" and hiding
  // older payments someone might actually be looking for (a mid-lease
  // receipt lookup, tax records, moving-out reference).
  const [historyYear, setHistoryYear] = useState<'all' | number>('all')

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

    // One row per calendar month, preferring a paid one — guards against
    // duplicate rows for the same month showing as both paid and overdue.
    const byMonth = new Map<string, any>()
    const paidRow = (p: any) => Number(p.expected_amount) > 0 && Number(p.actual_amount || 0) >= Number(p.expected_amount)
    for (const p of enriched) {
      const key = p.month.slice(0, 7)
      const current = byMonth.get(key)
      if (!current || (paidRow(p) && !paidRow(current))) byMonth.set(key, p)
    }
    setPayments(Array.from(byMonth.values()))
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

  // A bank payment can take days to clear, and Stripe's confirmation can be
  // late. Check any month with an open payment once, so it shows as
  // processing or paid instead of offering another Pay button.
  const syncedRentIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!tenancy) return
    const open = payments
      .filter(
        (p) =>
          p.stripe_payment_intent_id &&
          ['requires_payment', 'processing'].includes(p.stripe_status || '') &&
          !syncedRentIds.current.has(p.id)
      )
      .slice(0, 3)
    if (open.length === 0) return
    open.forEach((p) => syncedRentIds.current.add(p.id))

    Promise.all(
      open.map((p) =>
        fetch('/api/stripe/rent-payment/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rentPaymentId: p.id }),
        })
          .then((res) => res.json())
          .catch(() => null)
      )
    ).then((results) => {
      const changed = open.some((p, i) => {
        const status = results[i]?.status
        return status === 'paid' || status === 'already_paid' || status === 'refunded_credit_card' || (status === 'processing' && p.stripe_status !== 'processing')
      })
      if (changed) loadPayments(tenancy.id)
    })
  }, [payments, tenancy])

  // Opens the "how do you want to pay" choice first — the PaymentIntent
  // itself can't be created until a method is picked, since a card payment
  // adds a visible processing-fee surcharge that a bank payment never has,
  // and the charge amount has to be fixed before the PaymentIntent exists.
  // Debit card is safe to offer alongside bank transfer: StripePaymentModal's
  // `verify` prop (below) catches a credit card AFTER Stripe confirms it and
  // shows an honest rejection screen instead of a false "Payment complete,"
  // which is what used to make offering card risky here at all.
  const handlePayNow = (payment: any) => {
    setError(null)
    setMethodChoicePayment(payment)
  }

  const handleChooseMethod = async (payment: any, method: 'bank' | 'card') => {
    setMethodChoicePayment(null)
    setPayingId(payment.id)
    setError(null)

    try {
      const res = await fetch('/api/stripe/rent/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentPaymentId: payment.id, paymentMethod: method }),
      })
      const data = await res.json()
      if (data.alreadyPaid) {
        // Stripe already has this payment; the page was just behind.
        if (tenancy) await loadPayments(tenancy.id)
        setPayingId(null)
        return
      }
      if (!res.ok || !data.clientSecret) {
        setError(data.error || t('couldNotStartPayment', lang))
        if (tenancy) await loadPayments(tenancy.id)
        setPayingId(null)
        return
      }
      setModal({ clientSecret: data.clientSecret, amount: data.amount, rentPaymentId: payment.id })
    } catch {
      setError(t('couldNotStartPayment', lang))
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

  // A bank payment that has started but not cleared yet.
  const isProcessing = (payment: any) => payment.stripe_status === 'processing' && !isPaid(payment)

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
    if (lang === 'es') {
      if (days < 0) return `${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'} de atraso`
      if (days === 0) return 'Vence hoy'
      return `Vence en ${days} día${days === 1 ? '' : 's'}`
    }
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} late`
    if (days === 0) return 'Due today'
    return `Due in ${days} day${days === 1 ? '' : 's'}`
  }

  const unpaid = payments.filter((p) => !isPaid(p)).sort((a, b) => a.month.localeCompare(b.month))
  const paid = payments.filter(isPaid)
  const paymentYears = Array.from(new Set(paid.map((p) => Number(p.month.slice(0, 4))))).sort((a, b) => b - a)
  const paidInSelectedYear = historyYear === 'all' ? paid : paid.filter((p) => Number(p.month.slice(0, 4)) === historyYear)
  const yearTotal = paidInSelectedYear.reduce((sum, p) => sum + Number(p.actual_amount) + Number(p.card_surcharge_amount || 0), 0)
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
          <p className="text-white/60 text-sm">{lang === 'es' ? `Renta de ${formatMonth(payment.month)}` : `${formatMonth(payment.month)} rent`}</p>
          <span className={`text-xs font-semibold rounded-full px-3 py-1 ${tone.pill}`}>{dueText(payment)}</span>
        </div>

        <p className="text-white text-4xl font-bold tracking-tight mt-3 tabular-nums">{money(amountDue)}</p>
        <p className="text-white/50 text-sm mt-1 flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5" />
          {lang === 'es' ? `Vence ${formatDue(payment)}` : `Due ${formatDue(payment)}`}
        </p>

        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden mt-5" aria-hidden="true">
          <div className={`h-full rounded-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between text-white/70">
            <span>{t('rentLabel', lang)}</span>
            <span className="tabular-nums">{money(rent)}</span>
          </div>
          {water > 0 && (
            <div className="flex justify-between text-white/70">
              <span className="flex items-center gap-2 flex-wrap">
                {t('waterLabel', lang)}
                {payment.water_period_start && payment.water_period_end && (
                  <span className="text-white/40 text-xs">
                    ({new Date(payment.water_period_start + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(payment.water_period_end + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})
                  </span>
                )}
                {payment.waterBillViewUrl && (
                  <a
                    href={payment.waterBillViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#12A5A9] text-xs hover:underline"
                  >
                    <FileTextIcon className="w-3 h-3" /> {t('viewBill', lang)}
                  </a>
                )}
              </span>
              <span className="tabular-nums">{money(water)}</span>
            </div>
          )}
          {lateFee > 0 && (
            <div className="flex justify-between text-yellow-400">
              <span>{t('lateFeeLabel', lang)}</span>
              <span className="tabular-nums">{money(lateFee)}</span>
            </div>
          )}
          {paidSoFar > 0 && (
            <div className="flex justify-between text-[#12A5A9]">
              <span>{t('alreadyPaidLabel', lang)}</span>
              <span className="tabular-nums">−{money(paidSoFar)}</span>
            </div>
          )}
          <div className="flex justify-between text-white font-semibold pt-2 border-t border-white/10">
            <span>{t('totalDueLabel', lang)}</span>
            <span className="tabular-nums">{money(amountDue)}</span>
          </div>
        </div>

        {isProcessing(payment) ? (
          <div className="mt-6 rounded-2xl border border-yellow-500/25 bg-yellow-500/10 px-4 py-4 text-center">
            <p className="text-yellow-400 font-semibold text-sm">{t('bankPaymentProcessing', lang)}</p>
            <p className="text-white/60 text-xs mt-1">{t('bankPaymentProcessingDesc', lang)}</p>
          </div>
        ) : (
          <>
            <RippleButton
              onClick={() => handlePayNow(payment)}
              disabled={payingId === payment.id}
              className="w-full mt-6 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3.5 rounded-2xl hover:opacity-90 transition disabled:opacity-50"
            >
              {payingId === payment.id ? t('loadingShort', lang) : `${lang === 'es' ? 'Pagar' : 'Pay'} ${money(amountDue)}`}
            </RippleButton>
            <p className="text-white/50 text-xs text-center mt-3">{t('payStraightToLandlord', lang)}</p>
          </>
        )}
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
            {upcoming ? (lang === 'es' ? `Vence ${formatDue(payment)}` : `Due ${formatDue(payment)}`) : dueText(payment)}
            {payment.water_amount ? ` · ${lang === 'es' ? `incl. ${money(Number(payment.water_amount))} de agua` : `incl. ${money(Number(payment.water_amount))} water`}` : ''}
          </p>
          {payment.waterBillViewUrl && (
            <a
              href={payment.waterBillViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#12A5A9] text-xs hover:underline mt-1 inline-block"
            >
              {t('viewWaterBill', lang)}
            </a>
          )}
        </div>
        {isProcessing(payment) ? (
          <span className="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl bg-yellow-500/15 text-yellow-400 text-center leading-tight">
            {lang === 'es' ? <>Pago bancario<br />en proceso</> : <>Bank payment<br />processing</>}
          </span>
        ) : (
          <RippleButton
            onClick={() => handlePayNow(payment)}
            disabled={payingId === payment.id}
            className={`shrink-0 text-xs font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-50 ${
              primary
                ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white hover:opacity-90'
                : 'bg-white/8 text-white hover:bg-white/12'
            }`}
          >
            {payingId === payment.id
              ? t('loadingShort', lang)
              : upcoming
                ? (lang === 'es' ? `Pagar antes ${money(amountDue)}` : `Pay early ${money(amountDue)}`)
                : `${lang === 'es' ? 'Pagar' : 'Pay'} ${money(amountDue)}`}
          </RippleButton>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          {t('backArrow', lang)}
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
            <p className="text-white/50 text-sm">{t('noActiveLease', lang)}</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">{t('rentTitle', lang)}</h1>
              <p className="text-white/50 text-sm mt-1">
                {unitLabel ? `${unitLabel} · ` : ''}
                {tenancy.rent_amount ? `${money(Number(tenancy.rent_amount))}/${lang === 'es' ? 'mes' : 'month'}, ${dueDayPhrase(tenancy.rent_due_day || 1, lang)}` : ''}
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
                {error}
              </div>
            )}

            {payments.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
                <p className="text-white/50 text-sm">{t('nothingToPayYet', lang)}</p>
              </div>
            ) : (
              <>
                {heroPayment ? (
                  renderHero(heroPayment)
                ) : (
                  <div className="bg-[#0A7B7E]/12 border border-[#12A5A9]/30 rounded-3xl p-6 mb-6">
                    <p className="text-[#12A5A9] font-semibold flex items-center gap-2">
                      <CheckCircleIcon className="w-5 h-5" /> {t('allPaidUp', lang)}
                    </p>
                    <p className="text-white/60 text-sm mt-1">
                      {nextUp
                        ? (lang === 'es'
                            ? `Próximo: ${formatMonth(nextUp.month)}, vence ${formatDue(nextUp)}.`
                            : `Next up: ${formatMonth(nextUp.month)}, due ${formatDue(nextUp)}.`)
                        : t('nothingDueRightNow', lang)}
                    </p>
                  </div>
                )}

                {(nextUp || otherUnpaid.length > 0) && (
                  <section className="mb-8">
                    <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-3">
                      {heroPayment ? t('comingUp', lang) : t('payAheadIfYouLike', lang)}
                    </h2>
                    <ScrollReveal className="space-y-3">
                      {nextUp && renderUpcomingRow(nextUp, true)}
                      {otherUnpaid.map((p) => renderUpcomingRow(p, false))}
                    </ScrollReveal>
                  </section>
                )}

                {paid.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wide">{t('paymentHistory', lang)}</h2>
                      <div className="flex items-center gap-3">
                        <span className="text-white/50 text-xs tabular-nums">{t('totalPaidPrefix', lang)} {money(yearTotal)}</span>
                        {paymentYears.length > 1 && (
                          <select
                            value={historyYear}
                            onChange={(e) => setHistoryYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-[#12A5A9] transition"
                          >
                            <option value="all" className="bg-[#0C1A2E]">{t('allYearsOption', lang)}</option>
                            {paymentYears.map((y) => (
                              <option key={y} value={y} className="bg-[#0C1A2E]">{y}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl divide-y divide-white/8">
                      {paidInSelectedYear.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium">{formatMonth(payment.month)}</p>
                            <p className="text-white/50 text-xs mt-0.5">
                              {payment.paid_date
                                ? `${t('paidLabel', lang)} ${new Date(payment.paid_date + 'T00:00:00').toLocaleDateString()}`
                                : t('paidLabel', lang)}
                              {payment.water_amount ? ` · ${lang === 'es' ? `incl. ${money(Number(payment.water_amount))} de agua` : `incl. ${money(Number(payment.water_amount))} water`}` : ''}
                              {Number(payment.card_surcharge_amount || 0) > 0
                                ? ` · ${t('inclCardFeePrefix', lang)} ${money(Number(payment.card_surcharge_amount))} ${t('cardFeeSuffix', lang)}`
                                : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-white text-sm tabular-nums">
                              {money(Number(payment.actual_amount) + Number(payment.card_surcharge_amount || 0))}
                            </span>
                            <Link href={`/receipts/rent/${payment.id}`} className="text-[#12A5A9] text-xs font-semibold hover:underline">
                              {t('receipt', lang)}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </ScrollReveal>
                  </section>
                )}

                <p className="text-white/50 text-xs mt-8">
                  {t('rentDisclaimer', lang)}
                </p>
              </>
            )}
          </>
        )}
      </main>

      {methodChoicePayment && (() => {
        const amountDue = Number(methodChoicePayment.expected_amount) - Number(methodChoicePayment.actual_amount || 0)
        const fee = cardProcessingFee(amountDue)
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
            <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-white font-semibold mb-4">{t('howDoYouWantToPay', lang)}</h3>
              <div className="space-y-3">
                <button
                  onClick={() => handleChooseMethod(methodChoicePayment, 'bank')}
                  className="w-full text-left bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl px-4 py-3 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium text-sm">{t('bankAccountOptionLabel', lang)}</span>
                    <span className="text-white font-semibold text-sm tabular-nums">{money(amountDue)}</span>
                  </div>
                  <p className="text-white/50 text-xs mt-1">{t('bankAccountOptionDesc', lang)}</p>
                </button>
                <button
                  onClick={() => handleChooseMethod(methodChoicePayment, 'card')}
                  className="w-full text-left bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl px-4 py-3 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium text-sm">{t('debitCardOptionLabel', lang)}</span>
                    <span className="text-white font-semibold text-sm tabular-nums">{money(amountDue + fee)}</span>
                  </div>
                  <p className="text-white/50 text-xs mt-1">
                    +{money(fee)} {t('processingFeeSuffix', lang)} · {t('debitCardOptionDescPrefix', lang)}
                  </p>
                </button>
              </div>
              <button
                onClick={() => setMethodChoicePayment(null)}
                className="w-full text-center text-white/50 hover:text-white text-sm mt-4 transition"
              >
                {t('cancel', lang)}
              </button>
            </div>
          </div>
        )
      })()}

      {modal && (
        <StripePaymentModal
          clientSecret={modal.clientSecret}
          amount={modal.amount}
          title={t('payRentModalTitle', lang)}
          note={t('payRentModalNote', lang)}
          onClose={() => setModal(null)}
          verify={async () => {
            // Asks Stripe what actually happened and records it — the same
            // call this page already relied on, now also the thing that
            // decides whether the success screen is allowed to show at all.
            const result = await fetch('/api/stripe/rent-payment/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rentPaymentId: modal.rentPaymentId }),
            }).then((r) => r.json()).catch(() => null)
            if (tenancy) await loadPayments(tenancy.id)
            if (result?.status === 'refunded_credit_card') {
              return { ok: false, message: t('creditCardRentRejectedMessage', lang) }
            }
            return { ok: true }
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}
