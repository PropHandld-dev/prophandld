'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'
import Link from 'next/link'

type WindowCount = { thisWeek: number; lastWeek: number }

type Digest = {
  rangeStart: string
  rangeEnd: string
  signups: { landlord: WindowCount; renter: WindowCount; contractor: WindowCount }
  properties: WindowCount
  units: WindowCount
  jobsCompleted: WindowCount
  rentCollected: WindowCount
  mrr: { now: number; weekAgo: number | null }
  openDisputes: { id: string; reason: string; createdAt: string; jobCategory: string | null; address: string | null }[]
  pendingVerifications: { id: string; createdAt: string; contractorName: string }[]
}

export default function AdminWeeklyPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Digest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      // Same mount-before-AdminLayout-authorizes gap as the other admin
      // pages — RLS is the real backstop (this route is service-role only
      // and itself re-checks admin_users), this is the app-layer check.
      const accessCheck = await fetch('/api/admin/check-access').then((r) => r.json()).catch(() => ({ authorized: false }))
      if (!accessCheck.authorized) {
        setLoading(false)
        return
      }

      const res = await fetch('/api/admin/weekly-digest')
      if (!res.ok) {
        setError('Could not load this week’s numbers.')
        setLoading(false)
        return
      }
      setData(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  const dateRange = data
    ? `${new Date(data.rangeStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(data.rangeEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : ''

  return (
    <AdminLayout>
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">This week</h1>
        {data && <span className="text-white/40 text-sm">{dateRange}</span>}
      </div>
      <p className="text-white/50 text-sm mb-8">
        A 7-day snapshot for the weekly check-in — what happened, and what needs a call from us.
      </p>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      ) : !data ? null : (
        <>
          <ScrollReveal>
            <h2 className="text-white/70 font-semibold text-sm mb-3">Growth</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
              <StatCard label="New landlords" {...data.signups.landlord} />
              <StatCard label="New renters" {...data.signups.renter} />
              <StatCard label="New contractors" {...data.signups.contractor} />
              <StatCard label="Properties added" {...data.properties} />
              <StatCard label="Units added" {...data.units} />
              <StatCard label="Jobs completed" {...data.jobsCompleted} />
              <StatCard label="Rent collected" {...data.rentCollected} isCurrency />
              <StatCard
                label="MRR"
                thisWeek={data.mrr.now}
                lastWeek={data.mrr.weekAgo ?? data.mrr.now}
                isCurrency
                noHistory={data.mrr.weekAgo == null}
              />
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <h2 className="text-white/70 font-semibold text-sm mb-3">Needs a decision</h2>
            <div className="grid md:grid-cols-2 gap-4 mb-10">
              <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-semibold text-sm">Open disputes</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">
                    {data.openDisputes.length}
                  </span>
                </div>
                {data.openDisputes.length === 0 ? (
                  <p className="text-white/40 text-sm">Nothing open.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.openDisputes.map((d) => (
                      <Link key={d.id} href="/admin/disputes" className="block hover:bg-white/5 rounded-lg -mx-2 px-2 py-1.5 transition">
                        <p className="text-white/80 text-xs font-medium">
                          {d.jobCategory || 'Job'}{d.address ? ` · ${d.address}` : ''}
                        </p>
                        <p className="text-white/50 text-xs truncate">{d.reason}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-semibold text-sm">Pending contractor verifications</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">
                    {data.pendingVerifications.length}
                  </span>
                </div>
                {data.pendingVerifications.length === 0 ? (
                  <p className="text-white/40 text-sm">Nothing pending.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.pendingVerifications.map((v) => (
                      <Link key={v.id} href="/admin/contractors" className="flex items-center justify-between hover:bg-white/5 rounded-lg -mx-2 px-2 py-1.5 transition">
                        <p className="text-white/80 text-xs font-medium">{v.contractorName}</p>
                        <p className="text-white/40 text-xs">{new Date(v.createdAt).toLocaleDateString()}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}

function StatCard({
  label,
  thisWeek,
  lastWeek,
  isCurrency,
  noHistory,
}: {
  label: string
  thisWeek: number
  lastWeek: number
  isCurrency?: boolean
  noHistory?: boolean
}) {
  const fmt = (n: number) => (isCurrency ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : n.toLocaleString())
  const delta = thisWeek - lastWeek
  const deltaLabel = noHistory ? null : delta === 0 ? 'Flat vs last week' : `${delta > 0 ? '+' : '-'}${isCurrency ? '$' : ''}${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 0 })} vs last week`
  const tone = noHistory ? 'text-white/40' : delta > 0 ? 'text-[#12A5A9]' : delta < 0 ? 'text-red-400' : 'text-white/40'

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
      <p className="text-white/50 text-xs mb-1.5">{label}</p>
      <p className="text-white text-2xl font-bold tabular-nums">{fmt(thisWeek)}</p>
      {deltaLabel && <p className={`text-xs mt-1 ${tone}`}>{deltaLabel}</p>}
    </div>
  )
}
