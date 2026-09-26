'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { LANDLORD_TABS } from '@/lib/navTabs'

const MONTHS_SHOWN = 6

// 'YYYY-MM' for the last MONTHS_SHOWN months, oldest first.
function monthKeys(count: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

type Cell = { status: 'paid' | 'partial' | 'unpaid' | 'no-tenant'; expected?: number; actual?: number; paymentId?: string }

export default function RentRollPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<{ unitId: string; propertyId: string; label: string; hasTenancy: boolean; cells: Record<string, Cell> }[]>([])

  const months = monthKeys(MONTHS_SHOWN)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: properties } = await supabase
        .from('properties')
        .select('id, address')
        .eq('owner_user_id', user.id)
        .eq('archived', false)
        .order('address')

      const propertyIds = (properties || []).map((p) => p.id)
      if (propertyIds.length === 0) {
        setLoading(false)
        return
      }
      const propertyById = new Map((properties || []).map((p) => [p.id, p]))

      const { data: units } = await supabase
        .from('units')
        .select('id, unit_number, property_id')
        .in('property_id', propertyIds)
        .order('unit_number')

      const unitIds = (units || []).map((u) => u.id)
      if (unitIds.length === 0) {
        setLoading(false)
        return
      }

      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('id, unit_id, rent_amount')
        .in('unit_id', unitIds)
        .eq('ended', false)

      const tenancyByUnit = new Map((tenancies || []).map((t) => [t.unit_id, t]))
      const tenancyIds = (tenancies || []).map((t) => t.id)

      const earliestMonth = `${months[0]}-01`
      const { data: payments } = tenancyIds.length
        ? await supabase
            .from('rent_payments')
            .select('id, tenancy_id, month, expected_amount, actual_amount')
            .in('tenancy_id', tenancyIds)
            .gte('month', earliestMonth)
        : { data: [] as any[] }

      const paymentsByTenancyMonth = new Map<string, any>()
      for (const p of payments || []) {
        const key = `${p.tenancy_id}:${String(p.month).slice(0, 7)}`
        paymentsByTenancyMonth.set(key, p)
      }

      const builtRows = (units || []).map((unit) => {
        const property = propertyById.get(unit.property_id)
        const tenancy = tenancyByUnit.get(unit.id)
        const cells: Record<string, Cell> = {}
        for (const m of months) {
          if (!tenancy) {
            cells[m] = { status: 'no-tenant' }
            continue
          }
          const payment = paymentsByTenancyMonth.get(`${tenancy.id}:${m}`)
          if (!payment) {
            cells[m] = { status: 'no-tenant' } // no row generated for this month yet
            continue
          }
          const expected = Number(payment.expected_amount || 0)
          const actual = Number(payment.actual_amount || 0)
          cells[m] = {
            status: actual >= expected && expected > 0 ? 'paid' : actual > 0 ? 'partial' : 'unpaid',
            expected,
            actual,
            paymentId: payment.id,
          }
        }
        return {
          unitId: unit.id,
          propertyId: unit.property_id,
          label: `${property?.address || 'Unknown'} · ${unit.unit_number}`,
          hasTenancy: !!tenancy,
          cells,
        }
      })

      setRows(builtRows)
      setLoading(false)
    }
    init()
  }, [router])

  const cellStyle = (status: Cell['status']) => {
    if (status === 'paid') return 'bg-[#12A5A9]/15 text-[#12A5A9]'
    if (status === 'partial') return 'bg-yellow-500/15 text-yellow-400'
    if (status === 'unpaid') return 'bg-red-500/10 text-red-400'
    return 'bg-white/3 text-white/25'
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10 pb-28">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Rent roll</h1>
          <p className="text-white/50 text-sm mt-1">Every unit, the last {MONTHS_SHOWN} months, at a glance.</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-64" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">No units yet.</p>
          </div>
        ) : (
          <ScrollReveal>
            <div className="overflow-x-auto bg-white/3 border border-white/8 rounded-2xl">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="text-left text-white/50 text-xs font-medium uppercase tracking-wide px-4 py-3">Unit</th>
                    {months.map((m) => (
                      <th key={m} className="text-center text-white/50 text-xs font-medium uppercase tracking-wide px-2 py-3">
                        {monthLabel(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.unitId} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/landlord/properties/${row.propertyId}/units/${row.unitId}/rent`}
                          className="text-white text-sm hover:text-[#12A5A9] transition truncate block max-w-[220px]"
                        >
                          {row.label}
                        </Link>
                        {!row.hasTenancy && <span className="text-white/30 text-xs">No tenant</span>}
                      </td>
                      {months.map((m) => {
                        const cell = row.cells[m]
                        return (
                          <td key={m} className="px-2 py-3 text-center">
                            <Link
                              href={`/landlord/properties/${row.propertyId}/units/${row.unitId}/rent`}
                              className={`inline-flex items-center justify-center w-14 h-9 rounded-lg text-xs font-semibold transition hover:opacity-80 ${cellStyle(cell.status)}`}
                              title={cell.expected ? `Expected $${cell.expected} · Paid $${cell.actual}` : undefined}
                            >
                              {cell.status === 'paid' ? '✓' : cell.status === 'partial' ? '½' : cell.status === 'unpaid' ? '✕' : '—'}
                            </Link>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/50 flex-wrap mt-4">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#12A5A9]/40" /> Paid</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-500/40" /> Partial</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /> Unpaid</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/10" /> No tenant / no record yet</span>
            </div>
          </ScrollReveal>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
