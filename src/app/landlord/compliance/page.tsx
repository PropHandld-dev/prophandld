'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BottomTabBar } from '@/components/BottomTabBar'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { getLandlordIds } from '@/lib/landlordIds'
import { getComplianceStatus, type ComplianceStatusKey } from '@/lib/complianceStatus'
import { useLanguage } from '@/lib/i18n'

type Item = { id: string; item_type: string; expiry_date: string | null; reminder_days: number | null; property_id: string; properties: { address: string; city: string | null } | null }

const ORDER: Record<ComplianceStatusKey, number> = { expired: 0, expiring_soon: 1, current: 2, no_expiry: 3 }

// Every license, inspection and certificate across all of your properties
// in one list, most urgent first. Each row opens that property's page.
export default function ComplianceOverviewPage() {
  const router = useRouter()
  const lang = useLanguage()
  const es = lang === 'es'
  const [items, setItems] = useState<Item[] | null>(null)
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const ids = await getLandlordIds(supabase, user.id)
      const { data: props } = await supabase.from('properties').select('id, address').in('owner_user_id', ids).eq('archived', false).order('address')
      setProperties(props || [])
      const propIds = (props || []).map((p) => p.id)
      if (propIds.length === 0) {
        setItems([])
        return
      }
      const { data } = await supabase
        .from('compliance_items')
        .select('id, item_type, expiry_date, reminder_days, property_id, properties(address, city)')
        .in('property_id', propIds)
      setItems((data || []) as any)
    }
    load()
  }, [router])

  const rows = useMemo(
    () =>
      (items || [])
        .map((i) => ({ ...i, status: getComplianceStatus(i.expiry_date, i.reminder_days) }))
        .sort((a, b) => ORDER[a.status.key] - ORDER[b.status.key] || (a.status.daysUntil ?? 9999) - (b.status.daysUntil ?? 9999)),
    [items]
  )
  const counts = useMemo(() => {
    const c = { expired: 0, expiring_soon: 0, current: 0, no_expiry: 0 }
    for (const r of rows) c[r.status.key]++
    return c
  }, [rows])
  const withoutItems = properties.filter((p) => !(items || []).some((i) => i.property_id === p.id))

  const pill = (k: ComplianceStatusKey, days: number | null) =>
    k === 'expired'
      ? { cls: 'bg-red-500/15 text-red-400', text: es ? 'Vencido' : 'Expired' }
      : k === 'expiring_soon'
        ? { cls: 'bg-yellow-500/15 text-yellow-400', text: es ? `${days} días` : `${days} day${days === 1 ? '' : 's'} left` }
        : k === 'current'
          ? { cls: 'bg-[#12A5A9]/15 text-[#12A5A9]', text: es ? 'Al día' : 'Current' }
          : { cls: 'bg-white/8 text-white/50', text: es ? 'Sin fecha' : 'No expiry' }

  return (
    <div className="min-h-screen bg-[#0C1A2E] pb-28">
      <nav className="border-b border-white/8 px-5 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm">← {es ? 'Inicio' : 'Dashboard'}</Link>
        <span className="text-white font-semibold text-sm">{es ? 'Cumplimiento' : 'Compliance'}</span>
        <span className="w-16" />
      </nav>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{es ? 'Licencias e inspecciones' : 'Licenses and inspections'}</h1>
        <p className="text-white/55 text-sm mt-1">{es ? 'Todo lo que vence, en todas tus propiedades. Lo más urgente primero.' : 'Everything that expires, across all your properties. Most urgent first.'}</p>

        {items === null ? (
          <div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5 mt-6">
              {[
                { n: counts.expired, label: es ? 'Vencidos' : 'Expired', tone: counts.expired ? 'text-red-400' : 'text-white' },
                { n: counts.expiring_soon, label: es ? 'Vencen pronto' : 'Expiring soon', tone: counts.expiring_soon ? 'text-yellow-400' : 'text-white' },
                { n: counts.current + counts.no_expiry, label: es ? 'Al día' : 'Up to date', tone: 'text-white' },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl border border-white/8 bg-white/3 p-3.5 min-w-0">
                  <p className={`text-2xl font-bold tabular-nums ${c.tone}`}>{c.n}</p>
                  <p className="text-white/50 text-xs mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>

            {rows.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/8 bg-white/3 p-8 text-center">
                <p className="text-white font-semibold">{es ? 'Nada registrado todavía' : 'Nothing tracked yet'}</p>
                <p className="text-white/50 text-sm mt-1">{es ? 'Agrega tu licencia de alquiler o inspecciones desde cada propiedad.' : 'Add your rental license or inspections from each property, and we will remind you before they expire.'}</p>
              </div>
            ) : (
              <ul className="mt-6 rounded-2xl border border-white/8 bg-white/3 divide-y divide-white/6 overflow-hidden">
                {rows.map((r) => {
                  const p = pill(r.status.key, r.status.daysUntil)
                  return (
                    <li key={r.id}>
                      <Link href={`/landlord/properties/${r.property_id}/compliance`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/4 transition">
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">{r.item_type}</p>
                          <p className="text-white/45 text-xs truncate">
                            {r.properties?.address}
                            {r.expiry_date ? ` · ${new Date(r.expiry_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                          </p>
                        </div>
                        <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0 ${p.cls}`}>{p.text}</span>
                        <span aria-hidden className="text-white/30">›</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}

            {withoutItems.length > 0 && (
              <div className="mt-6">
                <p className="text-white/45 text-xs font-semibold uppercase tracking-wider mb-2">{es ? 'Sin nada registrado' : 'Nothing tracked yet'}</p>
                <div className="flex flex-wrap gap-2">
                  {withoutItems.map((p) => (
                    <Link key={p.id} href={`/landlord/properties/${p.id}/compliance`} className="text-sm text-white/75 bg-white/4 border border-white/10 rounded-full px-3 py-1.5 hover:border-[#12A5A9]/40">
                      + {p.address}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
