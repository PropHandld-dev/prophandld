'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { ensureCurrentMonthRentPayment } from '@/lib/rentAutomation'

export default function UnitRentPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [unit, setUnit] = useState<any>(null)
  const [tenancy, setTenancy] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [waterEditId, setWaterEditId] = useState<string | null>(null)
  const [waterAmount, setWaterAmount] = useState('')
  const [showAddMonth, setShowAddMonth] = useState(false)
  const [addForm, setAddForm] = useState({ month: '', expected_amount: '' })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

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

  const loadPayments = async (tenancyId: string) => {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('rent_payments')
      .select('*')
      .eq('tenancy_id', tenancyId)
      .order('month', { ascending: false })

    if (paymentsError) {
      console.error('Error loading rent payments:', paymentsError)
      return
    }
    setPayments(paymentsData || [])
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

  const handleSetWaterAmount = async (payment: any, newWaterAmount: number) => {
    setSavingId(payment.id)
    setError(null)

    // expected_amount is the combined rent+water total actually charged —
    // recompute it from the rent portion (whatever it was before this
    // month's water amount was factored in) rather than adding on top,
    // so re-editing the water amount doesn't double-count.
    const rentPortion = Number(payment.expected_amount) - Number(payment.water_amount || 0)
    const newExpected = rentPortion + newWaterAmount

    const { error: updateError } = await supabase
      .from('rent_payments')
      .update({ water_amount: newWaterAmount, expected_amount: newExpected })
      .eq('id', payment.id)

    if (updateError) {
      console.error('Error setting water amount:', updateError)
      setError('Could not save water bill: ' + updateError.message)
      setSavingId(null)
      return
    }

    setWaterEditId(null)
    setWaterAmount('')
    await loadPayments(payment.tenancy_id)
    setSavingId(null)
  }

  const handleAddMonth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.month || !addForm.expected_amount || !tenancy) return

    setSavingId('add')
    setError(null)

    const { error: insertError } = await supabase.from('rent_payments').insert({
      tenancy_id: tenancy.id,
      month: `${addForm.month}-01`,
      expected_amount: parseFloat(addForm.expected_amount),
    })

    if (insertError) {
      console.error('Error adding rent entry:', insertError)
      setError('Could not add entry. Please try again.')
      setSavingId(null)
      return
    }

    setAddForm({ month: '', expected_amount: String(tenancy.rent_amount || '') })
    setShowAddMonth(false)
    await loadPayments(tenancy.id)
    setSavingId(null)
  }

  const handleDelete = async (paymentId: string) => {
    if (!window.confirm('Remove this entry?')) return

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
                              {payment.water_amount ? ` (incl. $${payment.water_amount} water)` : ''}
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
                          <button
                            onClick={() => handleDelete(payment.id)}
                            className="text-red-400/50 text-[11px] hover:text-red-400 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {!isPaid && (
                        waterEditId === payment.id ? (
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/8">
                            <input
                              type="number"
                              value={waterAmount}
                              onChange={(e) => setWaterAmount(e.target.value)}
                              placeholder="Water bill this month"
                              min={0}
                              step="0.01"
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                            />
                            <RippleButton
                              onClick={() => handleSetWaterAmount(payment, parseFloat(waterAmount) || 0)}
                              disabled={savingId === payment.id}
                              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                            >
                              Save
                            </RippleButton>
                            <button
                              onClick={() => { setWaterEditId(null); setWaterAmount('') }}
                              className="text-white/60 hover:text-white text-xs transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setWaterEditId(payment.id); setWaterAmount(payment.water_amount ? String(payment.water_amount) : '') }}
                            className="text-white/50 hover:text-white/60 text-[11px] mt-2 mr-3 transition"
                          >
                            {payment.water_amount ? 'Edit water bill' : '+ Add water bill'}
                          </button>
                        )
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

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
