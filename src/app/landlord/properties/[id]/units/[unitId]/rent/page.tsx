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
import { ensureCurrentMonthRentPayment } from '@/lib/rentAutomation'
import { FileTextIcon } from '@/components/icons'

export default function UnitRentPage() {
  const router = useRouter()
  const params = useParams()
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
  const [uploadingWaterBillId, setUploadingWaterBillId] = useState<string | null>(null)
  const [showAddMonth, setShowAddMonth] = useState(false)
  const [addForm, setAddForm] = useState({ month: '', expected_amount: '' })

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
        return status === 'paid' || status === 'refunded_credit_card' || (status === 'processing' && p.stripe_status !== 'processing')
      })
      if (changed) loadPayments(tenancy.id)
    })
  }, [payments, tenancy])

  const loadPayments = async (tenancyId: string) => {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('rent_payments')
      .select('*, documents(filename, file_url)')
      .eq('tenancy_id', tenancyId)
      .order('month', { ascending: false })

    if (paymentsError) {
      console.error('Error loading rent payments:', paymentsError)
      return
    }

    const enriched = await Promise.all(
      (paymentsData || []).map(async (payment) => {
        if (!payment.documents) return payment
        const { data: signedUrlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(payment.documents.file_url, 3600)
        return { ...payment, waterBillViewUrl: signedUrlData?.signedUrl }
      })
    )

    setPayments(enriched)
  }

  const handleAttachWaterBill = async (payment: any, file: File) => {
    if (!userId) return
    setUploadingWaterBillId(payment.id)
    setError(null)

    const fileExt = file.name.split('.').pop()
    const filePath = `${propertyId}/water-bill-${payment.id}-${crypto.randomUUID()}.${fileExt}`

    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file)
    if (uploadError) {
      console.error('Error uploading water bill:', uploadError)
      setError('Could not upload the water bill file.')
      setUploadingWaterBillId(null)
      return
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        property_id: propertyId,
        unit_id: unitId,
        uploaded_by: userId,
        document_type: 'Water Bill',
        filename: file.name,
        file_url: filePath,
      })
      .select('id')
      .single()

    if (docError || !doc) {
      console.error('Error saving water bill document record:', docError)
      setError('Could not save the water bill.')
      setUploadingWaterBillId(null)
      return
    }

    const { error: updateError } = await supabase
      .from('rent_payments')
      .update({ water_bill_document_id: doc.id })
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error linking water bill to rent payment:', updateError)
      setError('Could not attach the water bill to this month.')
      setUploadingWaterBillId(null)
      return
    }

    await loadPayments(payment.tenancy_id)
    setUploadingWaterBillId(null)
  }

  const handleMarkReceived = async (payment: any, amount?: number) => {
    setSavingId(payment.id)
    setError(null)

    const { error: updateError } = await supabase
      .from('rent_payments')
      .update({
        actual_amount: amount ?? payment.expected_amount,
        paid_date: new Date().toISOString().slice(0, 10),
      })
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error marking rent received:', updateError)
      setError('Could not save. Please try again.')
      setSavingId(null)
      return
    }

    setAdjustingId(null)
    setAdjustAmount('')
    await loadPayments(payment.tenancy_id)
    setSavingId(null)
  }

  const money = (n: number) =>
    n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })

  const lateFeeOf = (payment: any) => (payment.late_fee_applied ? Number(tenancy?.late_fee_amount || 0) : 0)
  const rentPortionOf = (payment: any) =>
    Number(payment.expected_amount) - Number(payment.water_amount || 0) - lateFeeOf(payment)

  // Saves the rent, water bill and water period for a month (paid or not) and
  // writes a dated line to its history describing what changed.
  const handleSaveEdit = async (payment: any, values: RentEditValues) => {
    setSavingId(payment.id)
    setEditError(null)

    const oldRent = rentPortionOf(payment)
    const oldWater = Number(payment.water_amount || 0)
    const total = Math.round((values.rent + values.water + lateFeeOf(payment)) * 100) / 100

    const changes: string[] = []
    if (values.rent !== oldRent) changes.push(`Rent ${money(oldRent)} → ${money(values.rent)}`)
    if (values.water !== oldWater) changes.push(`Water ${money(oldWater)} → ${money(values.water)}`)
    if ((values.periodStart || '') !== (payment.water_period_start || '') || (values.periodEnd || '') !== (payment.water_period_end || '')) {
      changes.push('Water bill period updated')
    }
    if (values.note) changes.push(values.note)
    const stamp = new Date().toISOString().slice(0, 10)
    const notes = [payment.notes, `${stamp}: ${changes.join(' · ')}`].filter(Boolean).join('\n')

    const update: Record<string, any> = {
      expected_amount: total,
      water_amount: values.water,
      notes,
    }
    // Only sent when set (or being cleared), so saving still works for
    // anyone who never uses the period fields.
    if (values.periodStart || payment.water_period_start) update.water_period_start = values.periodStart || null
    if (values.periodEnd || payment.water_period_end) update.water_period_end = values.periodEnd || null

    const { error: updateError } = await supabase.from('rent_payments').update(update).eq('id', payment.id)

    if (updateError) {
      console.error('Error saving rent month:', updateError)
      setEditError('Could not save: ' + updateError.message)
      setSavingId(null)
      return
    }

    setEditingId(null)
    await loadPayments(payment.tenancy_id)
    setSavingId(null)
  }

  // Settles an overpayment: refund it through Stripe, record a refund made
  // another way, or apply it as credit to next month's rent.
  const handleResolve = async (payment: any, mode: 'stripe_refund' | 'external_refund' | 'apply_to_next', overpaid: number) => {
    const question =
      mode === 'stripe_refund'
        ? `Refund ${money(overpaid)} to the tenant's original payment method through Stripe? It is taken back from your Stripe balance.`
        : mode === 'apply_to_next'
          ? `Apply ${money(overpaid)} as credit toward next month's rent?`
          : `Record that you already refunded ${money(overpaid)} to the tenant outside the app?`
    if (!window.confirm(question)) return

    setResolvingId(payment.id)
    setError(null)
    try {
      const res = await fetch('/api/rent-payment/resolve-overpayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentPaymentId: payment.id, mode, amount: overpaid }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Could not settle the overpayment.')
    } catch {
      setError('Could not settle the overpayment.')
    }
    await loadPayments(payment.tenancy_id)
    setResolvingId(null)
  }

  const handleAddMonth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.month || !addForm.expected_amount || !tenancy) return

    if (payments.some((p) => p.month.slice(0, 7) === addForm.month)) {
      setError('That month already exists. Tap Edit on it to change the amount instead.')
      return
    }

    setSavingId('add')
    setError(null)

    const { error: insertError } = await supabase.from('rent_payments').insert({
      tenancy_id: tenancy.id,
      month: `${addForm.month}-01`,
      expected_amount: parseFloat(addForm.expected_amount),
    })

    if (insertError) {
      console.error('Error adding rent entry:', insertError)
      setError(insertError.code === '23505' ? 'That month already exists. Tap Edit on it to change the amount instead.' : 'Could not add entry. Please try again.')
      setSavingId(null)
      return
    }

    setAddForm({ month: '', expected_amount: String(tenancy.rent_amount || '') })
    setShowAddMonth(false)
    await loadPayments(tenancy.id)
    setSavingId(null)
  }

  const handleDelete = async (paymentId: string) => {
    const target = payments.find((p) => p.id === paymentId)
    if (target?.stripe_status === 'succeeded') {
      setError('This month was paid online, so it can’t be deleted. Use Edit to correct it instead.')
      return
    }
    const recorded = Number(target?.actual_amount || 0)
    const message = recorded > 0
      ? `This month has ${money(recorded)} recorded as paid. Removing it also removes its receipt. Continue?`
      : 'Remove this entry?'
    if (!window.confirm(message)) return

    const { error: deleteError } = await supabase.from('rent_payments').delete().eq('id', paymentId)
    if (deleteError) {
      console.error('Error deleting rent entry:', deleteError)
      setError('Could not delete entry.')
      return
    }

    setPayments((prev) => prev.filter((p) => p.id !== paymentId))
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
        <Link
          href={`/landlord/properties/${propertyId}/units/${unitId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Unit
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
          <h1 className="text-2xl font-bold text-white">Rent</h1>
          <p className="text-white/50 text-sm mt-1">Unit {unit.unit_number}</p>
        </div>

        {!tenancy ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">No active tenant on this unit. Link a renter first to track rent.</p>
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
                <p className="text-white/50 text-sm">No rent months yet. This fills in automatically once the tenancy is active.</p>
              </div>
            ) : (
              <ScrollReveal>
              <div className="space-y-3 mb-6">
                {payments.map((payment) => {
                  const status = getStatus(payment)
                  const isPaid = status.label === 'Paid'
                  const isAdjusting = adjustingId === payment.id
                  const overpaid = Math.round((Number(payment.actual_amount || 0) - Number(payment.expected_amount || 0)) * 100) / 100
                  const paidOnline = payment.stripe_status === 'succeeded' && !!payment.stripe_payment_intent_id
                  const noteLines: string[] = payment.notes ? String(payment.notes).split('\n').filter(Boolean) : []
                  const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  const period = payment.water_period_start && payment.water_period_end
                    ? ` · ${shortDate(payment.water_period_start)} – ${shortDate(payment.water_period_end)}`
                    : ''
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
                                Bank payment processing
                              </span>
                            )}
                            <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-0.5">
                              ${payment.actual_amount ?? 0} of ${payment.expected_amount}
                              {payment.water_amount ? ` (incl. $${payment.water_amount} water${period})` : ''}
                            </span>
                            {payment.late_fee_applied && (
                              <span className="text-xs bg-yellow-500/15 text-yellow-400 rounded-full px-2.5 py-0.5">
                                Includes late fee
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {isPaid ? (
                            <Link href={`/receipts/rent/${payment.id}`} className="text-[#12A5A9] text-xs hover:underline">
                              Receipt
                            </Link>
                          ) : (
                            <RippleButton
                              onClick={() => handleMarkReceived(payment)}
                              disabled={savingId === payment.id}
                              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                            >
                              {savingId === payment.id ? 'Saving...' : 'Mark received'}
                            </RippleButton>
                          )}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => { setEditError(null); setEditingId(payment.id) }}
                              className="text-white/60 text-[11px] font-semibold hover:text-white transition"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(payment.id)}
                              className="text-red-400/50 text-[11px] hover:text-red-400 transition"
                            >
                              Delete
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
                                {resolvingId === payment.id ? 'Working…' : `Refund ${money(overpaid)} to tenant`}
                              </button>
                            )}
                            <button
                              onClick={() => handleResolve(payment, 'apply_to_next', overpaid)}
                              disabled={resolvingId === payment.id}
                              className="text-xs font-semibold bg-white/8 text-white rounded-lg px-3 py-2 hover:bg-white/12 transition disabled:opacity-50"
                            >
                              Credit to next month
                            </button>
                            <button
                              onClick={() => handleResolve(payment, 'external_refund', overpaid)}
                              disabled={resolvingId === payment.id}
                              className="text-xs text-white/50 hover:text-white transition disabled:opacity-50"
                            >
                              Refunded another way
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
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                            />
                            <RippleButton
                              onClick={() => handleMarkReceived(payment, parseFloat(adjustAmount) || payment.expected_amount)}
                              disabled={savingId === payment.id}
                              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                            >
                              Save
                            </RippleButton>
                            <button
                              onClick={() => { setAdjustingId(null); setAdjustAmount('') }}
                              className="text-white/60 hover:text-white text-xs transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAdjustingId(payment.id); setAdjustAmount(String(payment.expected_amount)) }}
                            className="text-white/50 hover:text-white/60 text-[11px] mt-2 transition"
                          >
                            Received a different amount?
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
                  <h2 className="text-white font-semibold text-sm">Log a different month</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-white/70 text-sm block mb-1">Month</label>
                      <input
                        type="month"
                        value={addForm.month}
                        onChange={(e) => setAddForm({ ...addForm, month: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-sm block mb-1">Expected amount</label>
                      <input
                        type="number"
                        value={addForm.expected_amount}
                        onChange={(e) => setAddForm({ ...addForm, expected_amount: e.target.value })}
                        min={0}
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
                      {savingId === 'add' ? 'Adding...' : 'Add month'}
                    </RippleButton>
                    <button
                      type="button"
                      onClick={() => setShowAddMonth(false)}
                      className="text-white/50 hover:text-white text-sm transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </ScrollReveal>
            ) : (
              <button
                onClick={() => setShowAddMonth(true)}
                className="text-white/50 hover:text-white/60 text-xs transition"
              >
                + Log a different month
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
            water={Number(payment.water_amount || 0)}
            lateFee={lateFeeOf(payment)}
            paidSoFar={Number(payment.actual_amount || 0)}
            periodStart={payment.water_period_start || ''}
            periodEnd={payment.water_period_end || ''}
            hasBillFile={!!payment.waterBillViewUrl}
            billFileUrl={payment.waterBillViewUrl}
            uploading={uploadingWaterBillId === payment.id}
            saving={savingId === payment.id}
            error={editError}
            onSave={(values) => handleSaveEdit(payment, values)}
            onAttach={(file) => handleAttachWaterBill(payment, file)}
            onClose={() => setEditingId(null)}
          />
        )
      })()}

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
