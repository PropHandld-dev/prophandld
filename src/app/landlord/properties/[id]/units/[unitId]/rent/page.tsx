'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { RentMonthEditor, type RentEditValues } from '@/components/RentMonthEditor'
import { utilityName, type UtilityCharge } from '@/lib/utilityCharges'
import { ensureCurrentMonthRentPayment } from '@/lib/rentAutomation'
import { useLanguage, t } from '@/lib/i18n'
import { useConfirm } from '@/lib/useConfirm'

export default function UnitRentPage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [unit, setUnit] = useState<any>(null)
  const [tenancy, setTenancy] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [chargesByMonth, setChargesByMonth] = useState<Record<string, UtilityCharge[]>>({})
  const [showAddMonth, setShowAddMonth] = useState(false)
  const [addForm, setAddForm] = useState({ month: '', expected_amount: '' })
  const { confirm, ConfirmDialog } = useConfirm()
  // A ref, not state: two clicks dispatched in the same tick (a fast real
  // double-click, or a double-tap on mobile) can both read savingId as
  // still-null before React's first setSavingId() re-render lands, so the
  // disabled={savingId === payment.id} guard alone isn't airtight. A ref
  // updates synchronously, closing that gap. Matters here specifically
  // because mark-received-notify (unlike the Stripe sync path) has
  // no server-side dedup of its own — a second call would email the renter
  // "rent marked as paid" twice for one real event.
  const markReceivedInFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)

      const { data: unitData } = await supabase
        .from('units')
        .select('*')
        .eq('id', unitId)
        .maybeSingle()

      if (!unitData) {
        router.replace(`/landlord/properties/${propertyId}`)
        return
      }
      setUnit(unitData)

      const { data: tenancyData } = await supabase
        .from('tenancies')
        .select('*')
        .eq('unit_id', unitId)
        .eq('ended', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!tenancyData) {
        setLoading(false)
        return
      }
      setTenancy(tenancyData)
      setAddForm((f) => ({ ...f, expected_amount: tenancyData.rent_amount ? String(tenancyData.rent_amount) : '' }))

      await ensureCurrentMonthRentPayment(supabase, tenancyData.id, tenancyData.rent_amount)
      await loadPayments(tenancyData.id)
      setLoading(false)
    }
    init()
  }, [unitId, propertyId, router])

  // A bank payment can take days to clear, and Stripe's confirmation can be
  // late. Check any month with an open payment once, so it shows as
  // processing or paid without the landlord having to mark it by hand.
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

  const loadPayments = async (tenancyId: string) => {
    const [{ data: paymentsData, error: paymentsError }, chargesRes] = await Promise.all([
      supabase.from('rent_payments').select('*').eq('tenancy_id', tenancyId).order('month', { ascending: false }),
      fetch(`/api/rent/utilities?tenancyId=${tenancyId}`).then((r) => r.json()).catch(() => null),
    ])

    if (paymentsError) {
      console.error('Error loading rent payments:', paymentsError)
      return
    }

    const grouped: Record<string, UtilityCharge[]> = {}
    for (const c of (chargesRes?.charges || []) as UtilityCharge[]) (grouped[c.rentPaymentId] ||= []).push(c)
    setChargesByMonth(grouped)
    setPayments(paymentsData || [])
  }

  const handleMarkReceived = async (payment: any, amount?: number) => {
    if (markReceivedInFlightRef.current.has(payment.id)) return
    markReceivedInFlightRef.current.add(payment.id)
    setSavingId(payment.id)
    setError(null)

    const { error: updateError } = await supabase
      .from('rent_payments')
      .update({
        actual_amount: amount ?? payment.expected_amount,
        // en-CA, not toISOString(): the latter converts to UTC first, so
        // marking a payment received in the evening (US) recorded it as
        // received the NEXT calendar day — caught live by an external
        // audit elsewhere in reporting, same root cause.
        paid_date: new Date().toLocaleDateString('en-CA'),
        // Carries the renter's own "I've sent this via X" signal through
        // to the existing payment_method field, so it doesn't just go
        // stale for P2P payments — Mark Received itself is still what
        // actually confirms the money arrived, this just records which
        // rail it came in on when the renter already told us.
        ...(payment.renter_marked_sent_method ? { payment_method: payment.renter_marked_sent_method } : {}),
      })
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error marking rent received:', updateError)
      setError(t('couldNotSaveTryAgain', lang))
      setSavingId(null)
      markReceivedInFlightRef.current.delete(payment.id)
      return
    }

    setAdjustingId(null)
    setAdjustAmount('')
    await loadPayments(payment.tenancy_id)
    setSavingId(null)
    markReceivedInFlightRef.current.delete(payment.id)

    fetch('/api/rent/mark-received-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rentPaymentId: payment.id }),
      keepalive: true,
    }).catch((err) => console.error('Error notifying renter of marked-received rent:', err))
  }

  const money = (n: number) =>
    n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })

  const lateFeeOf = (payment: any) => (payment.late_fee_applied ? Number(tenancy?.late_fee_amount || 0) : 0)
  const rentPortionOf = (payment: any) =>
    Math.round((Number(payment.expected_amount) - Number(payment.utilities_amount || 0) - lateFeeOf(payment)) * 100) / 100

  // Saves the rent and utility bills for a month (paid or not). The server
  // recomputes the total, writes the month's history and tells the tenant
  // about new bills; any attached bill files then go straight to storage.
  const handleSaveEdit = async (payment: any, values: RentEditValues) => {
    setSavingId(payment.id)
    setEditError(null)

    const typeOf = (f: File) => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      if (f.type === 'application/pdf' || ext === 'pdf') return 'pdf'
      if (f.type === 'image/png' || ext === 'png') return 'png'
      return 'jpg'
    }
    const res = await fetch(`/api/rent-payment/${payment.id}/utilities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rent: values.rent,
        note: values.note,
        charges: values.charges.map((c) => ({
          id: c.id,
          clientKey: c.key,
          kind: c.kind,
          label: c.label,
          amount: Number(c.amount || 0),
          periodStart: c.periodStart || null,
          periodEnd: c.periodEnd || null,
          attachFile: c.file ? typeOf(c.file) : null,
        })),
      }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) {
      setEditError(data.error || t('couldNotSavePrefix', lang))
      setSavingId(null)
      return
    }

    const failures: string[] = []
    for (const slot of (data.uploads || []) as { chargeId: string; clientKey?: string; path: string; token: string }[]) {
      const file = values.charges.find((c) => c.key === slot.clientKey)?.file
      if (!file) continue
      const { error: uploadError } = await supabase.storage.from('documents').uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || undefined })
      if (uploadError) {
        failures.push(file.name)
        continue
      }
      const attach = await fetch(`/api/rent-payment/${payment.id}/utilities/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeId: slot.chargeId, path: slot.path, filename: file.name }),
      }).catch(() => null)
      if (!attach?.ok) {
        const err = attach ? (await attach.json().catch(() => ({}))).error : null
        failures.push(err ? `${file.name} (${err})` : file.name)
      }
    }

    await loadPayments(payment.tenancy_id)
    setSavingId(null)
    if (failures.length > 0) {
      setEditError(`${t('billUploadFailed', lang)} ${failures.join(', ')}`)
      return
    }
    setEditingId(null)
  }

  // Settles an overpayment: refund it through Stripe, record a refund made
  // another way, or apply it as credit to next month's rent.
  const handleResolve = async (payment: any, mode: 'stripe_refund' | 'external_refund' | 'apply_to_next', overpaid: number) => {
    const question =
      mode === 'stripe_refund'
        ? `${t('refundToTenantStripeConfirmPrefix', lang)}${money(overpaid)}${t('refundToTenantStripeConfirmSuffix', lang)}`
        : mode === 'apply_to_next'
          ? `${t('applyCreditNextMonthConfirmPrefix', lang)}${money(overpaid)}${t('applyCreditNextMonthConfirmSuffix', lang)}`
          : `${t('recordRefundedOutsideConfirmPrefix', lang)}${money(overpaid)}${t('recordRefundedOutsideConfirmSuffix', lang)}`
    if (!(await confirm({ body: question }))) return

    setResolvingId(payment.id)
    setError(null)
    try {
      const res = await fetch('/api/rent-payment/resolve-overpayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentPaymentId: payment.id, mode, amount: overpaid }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || t('couldNotSettleOverpayment', lang))
    } catch {
      setError(t('couldNotSettleOverpayment', lang))
    }
    await loadPayments(payment.tenancy_id)
    setResolvingId(null)
  }

  const handleAddMonth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenancy) return
    // Caught live by an external audit: pressing Add with no month
    // selected did nothing at all — no error, no field guidance, just a
    // silent no-op that looked identical to a button that hadn't been
    // clicked.
    if (!addForm.month || !addForm.expected_amount) {
      setError(t('pleaseSelectMonthAndAmount', lang))
      return
    }

    if (payments.some((p) => p.month.slice(0, 7) === addForm.month)) {
      setError(t('monthAlreadyExists', lang))
      return
    }

    setSavingId('add')
    setError(null)

    const { data: inserted, error: insertError } = await supabase
      .from('rent_payments')
      .insert({
        tenancy_id: tenancy.id,
        month: `${addForm.month}-01`,
        expected_amount: parseFloat(addForm.expected_amount),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error adding rent entry:', insertError)
      setError(insertError.code === '23505' ? t('monthAlreadyExists', lang) : t('couldNotAddEntry', lang))
      setSavingId(null)
      return
    }

    setAddForm({ month: '', expected_amount: String(tenancy.rent_amount || '') })
    setShowAddMonth(false)
    await loadPayments(tenancy.id)
    setSavingId(null)

    // Previously notified no one — confirmed gap, see month-added-notify's
    // own comment for why the daily cron doesn't catch this either.
    if (inserted?.id) {
      fetch('/api/rent/month-added-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentPaymentId: inserted.id }),
        keepalive: true,
      }).catch((err) => console.error('Error notifying renter of new rent entry:', err))
    }
  }

  const handleDelete = async (paymentId: string) => {
    const target = payments.find((p) => p.id === paymentId)
    if (target?.stripe_status === 'succeeded') {
      setError(t('monthPaidOnlineCannotDelete', lang))
      return
    }
    const recorded = Number(target?.actual_amount || 0)
    const message = recorded > 0
      ? `${t('monthHasRecordedPaidConfirmPrefix', lang)}${money(recorded)}${t('monthHasRecordedPaidConfirmSuffix', lang)}`
      : t('removeThisEntryConfirm', lang)
    if (!(await confirm({ body: message, danger: true }))) return

    const { error: deleteError } = await supabase.from('rent_payments').delete().eq('id', paymentId)
    if (deleteError) {
      console.error('Error deleting rent entry:', deleteError)
      setError(t('couldNotDeleteEntry', lang))
      return
    }

    setPayments((prev) => prev.filter((p) => p.id !== paymentId))
  }

  const getStatus = (payment: any) => {
    const expected = payment.expected_amount || 0
    const actual = payment.actual_amount || 0

    if (actual >= expected && expected > 0) {
      return { key: 'paid' as const, label: t('paidStatus', lang), color: 'bg-[#12A5A9]/15 text-[#12A5A9]' }
    }

    const today = new Date()
    today.setDate(1)
    today.setHours(0, 0, 0, 0)
    const monthDate = new Date(payment.month + 'T00:00:00')

    if (monthDate < today) {
      return { key: 'late' as const, label: t('lateStatus', lang), color: 'bg-red-500/15 text-red-400' }
    }
    return { key: 'due' as const, label: t('dueStatus', lang), color: 'bg-yellow-500/15 text-yellow-400' }
  }

  const formatMonth = (month: string) =>
    new Date(month + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}/units/${unitId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          {t('unitBack', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <div className="mb-8">
              <Skeleton className="h-7 w-24 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-64 mb-6" />
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : !unit ? null : (
        <>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{t('rentTitle', lang)}</h1>
          <p className="text-white/50 text-sm mt-1">Unit {unit.unit_number}</p>
        </div>

        {!tenancy ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">{t('noActiveTenantRent', lang)}</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            {payments.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center mb-6">
                <p className="text-white/50 text-sm">{t('noRentMonthsYet', lang)}</p>
              </div>
            ) : (
              <ScrollReveal>
              <div className="space-y-3 mb-6">
                {payments.map((payment) => {
                  const status = getStatus(payment)
                  const isPaid = status.key === 'paid'
                  const isAdjusting = adjustingId === payment.id
                  const overpaid = Math.round((Number(payment.actual_amount || 0) - Number(payment.expected_amount || 0)) * 100) / 100
                  const paidOnline = payment.stripe_status === 'succeeded' && !!payment.stripe_payment_intent_id
                  const noteLines: string[] = payment.notes ? String(payment.notes).split('\n').filter(Boolean) : []
                  const bills = chargesByMonth[payment.id] || []
                  return (
                    <div key={payment.id} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-white font-semibold">{formatMonth(payment.month)}</h3>
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            <span className={`text-xs rounded-full px-2.5 py-0.5 ${status.color}`}>
                              {status.label}
                            </span>
                            {!isPaid && payment.stripe_status === 'processing' && (
                              <span className="text-xs bg-yellow-500/15 text-yellow-400 rounded-full px-2.5 py-0.5">
                                {t('bankPaymentProcessing', lang)}
                              </span>
                            )}
                            <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                              ${payment.actual_amount ?? 0} of ${payment.expected_amount}
                            </span>
                            {bills.map((b) => (
                              b.billUrl ? (
                                <a key={b.id} href={b.billUrl} target="_blank" rel="noopener noreferrer" className="text-xs bg-[#12A5A9]/10 text-[#12A5A9] rounded-full px-2.5 py-0.5 hover:bg-[#12A5A9]/20 transition">
                                  {utilityName(b, lang)} {money(b.amount)} ↗
                                </a>
                              ) : (
                                <span key={b.id} className="text-xs bg-white/8 text-white/60 rounded-full px-2.5 py-0.5">
                                  {utilityName(b, lang)} {money(b.amount)}
                                </span>
                              )
                            ))}
                            {payment.late_fee_applied && (
                              <span className="text-xs bg-yellow-500/15 text-yellow-400 rounded-full px-2.5 py-0.5">
                                {t('includesLateFee', lang)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {!isPaid && payment.renter_marked_sent_method && (
                            <span className="text-[11px] text-yellow-400 bg-yellow-500/10 rounded-full px-2.5 py-0.5">
                              {t('tenantMarkedSentPrefix', lang)} {payment.renter_marked_sent_method === 'cashapp' ? 'Cash App' : payment.renter_marked_sent_method === 'venmo' ? 'Venmo' : 'Zelle'}
                            </span>
                          )}
                          {isPaid ? (
                            <Link href={`/receipts/rent/${payment.id}`} className="text-[#12A5A9] text-xs hover:underline">
                              {t('receipt', lang)}
                            </Link>
                          ) : (
                            <RippleButton
                              onClick={() => handleMarkReceived(payment)}
                              disabled={savingId === payment.id}
                              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                            >
                              {savingId === payment.id ? t('markingReceived', lang) : t('markReceived', lang)}
                            </RippleButton>
                          )}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => { setEditError(null); setEditingId(payment.id) }}
                              className="text-white/60 text-[11px] font-semibold hover:text-white transition"
                            >
                              {t('edit', lang)}
                            </button>
                            <button
                              onClick={() => handleDelete(payment.id)}
                              className="text-red-400/50 text-[11px] hover:text-red-400 transition"
                            >
                              {t('delete', lang)}
                            </button>
                          </div>
                        </div>
                      </div>

                      {overpaid > 0.004 && (
                        <div className="mt-3 pt-3 border-t border-white/8">
                          <p className="text-[#12A5A9] text-sm font-semibold">Overpaid by {money(overpaid)}</p>
                          <p className="text-white/50 text-xs mt-0.5">This month was paid more than it now costs. Choose what happens to the difference:</p>
                          <div className="flex items-center gap-2 flex-wrap mt-2.5">
                            {paidOnline && (
                              <button
                                onClick={() => handleResolve(payment, 'stripe_refund', overpaid)}
                                disabled={resolvingId === payment.id}
                                className="text-xs font-semibold bg-[#12A5A9]/15 text-[#12A5A9] rounded-lg px-3 py-2 hover:bg-[#12A5A9]/25 transition disabled:opacity-50"
                              >
                                {resolvingId === payment.id ? t('working', lang) : `Refund ${money(overpaid)} to tenant`}
                              </button>
                            )}
                            <button
                              onClick={() => handleResolve(payment, 'apply_to_next', overpaid)}
                              disabled={resolvingId === payment.id}
                              className="text-xs font-semibold bg-white/8 text-white rounded-lg px-3 py-2 hover:bg-white/12 transition disabled:opacity-50"
                            >
                              {t('creditToNextMonth', lang)}
                            </button>
                            <button
                              onClick={() => handleResolve(payment, 'external_refund', overpaid)}
                              disabled={resolvingId === payment.id}
                              className="text-xs text-white/50 hover:text-white transition disabled:opacity-50"
                            >
                              {t('refundedAnotherWay', lang)}
                            </button>
                          </div>
                        </div>
                      )}

                      {!isPaid && (
                        isAdjusting ? (
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/8">
                            <input
                              type="number"
                              value={adjustAmount}
                              onChange={(e) => setAdjustAmount(e.target.value)}
                              placeholder={String(payment.expected_amount)}
                              min={0}
                              step={0.01}
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                            />
                            <RippleButton
                              onClick={() => handleMarkReceived(payment, parseFloat(adjustAmount) || payment.expected_amount)}
                              disabled={savingId === payment.id}
                              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                            >
                              {t('save', lang)}
                            </RippleButton>
                            <button
                              onClick={() => { setAdjustingId(null); setAdjustAmount('') }}
                              className="text-white/60 hover:text-white text-xs transition"
                            >
                              {t('cancel', lang)}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAdjustingId(payment.id); setAdjustAmount(String(payment.expected_amount)) }}
                            className="text-white/50 hover:text-white/60 text-[11px] mt-2 transition"
                          >
                            {t('receivedDifferentAmount', lang)}
                          </button>
                        )
                      )}

                      {noteLines.length > 0 && (
                        <ul className="mt-3 pt-3 border-t border-white/8 space-y-1">
                          {noteLines.slice(-3).map((line, i) => (
                            <li key={i} className="text-white/40 text-[11px] leading-snug">{line}</li>
                          ))}
                          {noteLines.length > 3 && <li className="text-white/30 text-[11px]">+ {noteLines.length - 3} earlier</li>}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
              </ScrollReveal>
            )}

            {showAddMonth ? (
              <ScrollReveal>
                <form onSubmit={handleAddMonth} className="bg-white/3 border border-white/8 rounded-2xl p-6 space-y-4">
                  <h2 className="text-white font-semibold text-sm">{t('logDifferentMonth', lang)}</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-white/70 text-sm block mb-1">{t('month', lang)}</label>
                      <input
                        type="month"
                        value={addForm.month}
                        onChange={(e) => setAddForm({ ...addForm, month: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-sm block mb-1">{t('expectedAmount', lang)}</label>
                      <input
                        type="number"
                        value={addForm.expected_amount}
                        onChange={(e) => setAddForm({ ...addForm, expected_amount: e.target.value })}
                        min={0}
                        step={0.01}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <RippleButton
                      type="submit"
                      disabled={savingId === 'add'}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
                    >
                      {savingId === 'add' ? t('adding2', lang) : t('addMonth', lang)}
                    </RippleButton>
                    <button
                      type="button"
                      onClick={() => setShowAddMonth(false)}
                      className="text-white/50 hover:text-white text-sm transition"
                    >
                      {t('cancel', lang)}
                    </button>
                  </div>
                </form>
              </ScrollReveal>
            ) : (
              <button
                onClick={() => setShowAddMonth(true)}
                className="text-white/50 hover:text-white/60 text-xs transition"
              >
                + {t('logDifferentMonth', lang)}
              </button>
            )}
          </>
        )}
        </>
        )}
      </main>

      {editingId && (() => {
        const payment = payments.find((p) => p.id === editingId)
        if (!payment) return null
        return (
          <RentMonthEditor
            key={payment.id}
            monthLabel={formatMonth(payment.month)}
            rent={rentPortionOf(payment)}
            charges={chargesByMonth[payment.id] || []}
            lateFee={lateFeeOf(payment)}
            paidSoFar={Number(payment.actual_amount || 0)}
            saving={savingId === payment.id}
            error={editError}
            onSave={(values) => handleSaveEdit(payment, values)}
            onClose={() => setEditingId(null)}
          />
        )
      })()}

      <BottomTabBar tabs={LANDLORD_TABS} />
      {ConfirmDialog}
    </div>
  )
}
