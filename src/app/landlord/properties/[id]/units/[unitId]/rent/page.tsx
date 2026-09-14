'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { LANDLORD_TABS } from '@/lib/navTabs'

export default function UnitRentPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unit, setUnit] = useState<any>(null)
  const [tenancy, setTenancy] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    month: '',
    expected_amount: '',
    actual_amount: '',
    paid_date: '',
    notes: '',
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: unitData } = await supabase
        .from('units')
        .select('*')
        .eq('id', unitId)
        .maybeSingle()

      if (!unitData) {
        router.push(`/landlord/properties/${propertyId}`)
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
      setForm((f) => ({ ...f, expected_amount: tenancyData.rent_amount ? String(tenancyData.rent_amount) : '' }))

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.month) {
      setError('Please pick a month.')
      return
    }
    if (!form.expected_amount) {
      setError('Please enter the expected amount.')
      return
    }
    if (!tenancy) return

    setSaving(true)
    setError(null)

    const monthFirstOfMonth = `${form.month}-01`

    const { error: insertError } = await supabase
      .from('rent_payments')
      .insert({
        tenancy_id: tenancy.id,
        month: monthFirstOfMonth,
        expected_amount: parseFloat(form.expected_amount),
        actual_amount: form.actual_amount ? parseFloat(form.actual_amount) : null,
        paid_date: form.paid_date || null,
        notes: form.notes.trim() || null,
      })

    if (insertError) {
      console.error('Error adding rent entry:', insertError)
      setError('Could not add entry. Please try again.')
      setSaving(false)
      return
    }

    setForm({ month: '', expected_amount: String(tenancy.rent_amount || ''), actual_amount: '', paid_date: '', notes: '' })
    await loadPayments(tenancy.id)
    setSaving(false)
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

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  if (!unit) return null

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}/units/${unitId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Unit
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Rent</h1>
          <p className="text-white/50 text-sm mt-1">Unit {unit.unit_number}</p>
        </div>

        {!tenancy ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No active tenant on this unit — link a renter first to track rent.</p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 space-y-4">
              <h2 className="text-white font-semibold mb-2">Log a month</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/70 text-sm block mb-1">Month</label>
                  <input
                    type="month"
                    name="month"
                    value={form.month}
                    onChange={handleChange}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm block mb-1">Expected amount</label>
                  <input
                    type="number"
                    name="expected_amount"
                    value={form.expected_amount}
                    onChange={handleChange}
                    min={0}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/70 text-sm block mb-1">Actual amount received</label>
                  <input
                    type="number"
                    name="actual_amount"
                    value={form.actual_amount}
                    onChange={handleChange}
                    min={0}
                    placeholder="Leave blank if not paid"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm block mb-1">Paid date</label>
                  <input
                    type="date"
                    name="paid_date"
                    value={form.paid_date}
                    onChange={handleChange}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-white/70 text-sm block mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add entry'}
              </button>
            </form>

            <h2 className="text-white font-semibold mb-4">
              History {payments.length > 0 && `(${payments.length})`}
            </h2>

            {payments.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
                <p className="text-white/30 text-sm">No rent entries logged yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => {
                  const status = getStatus(payment)
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
                          {payment.notes && <p className="text-white/40 text-xs mt-2">{payment.notes}</p>}
                        </div>
                        <button
                          onClick={() => handleDelete(payment.id)}
                          className="text-red-400/70 text-xs hover:text-red-400 transition shrink-0"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
