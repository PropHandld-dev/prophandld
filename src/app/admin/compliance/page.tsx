'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'

export default function AdminCompliancePage() {
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'needs-attention' | 'all'>('needs-attention')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const load = async () => {
      // Same mount-before-AdminLayout-authorizes gap as every other admin
      // page — RLS is the real backstop (this route is service-role only
      // and re-checks admin_users itself), this is the app-layer check.
      const accessCheck = await fetch('/api/admin/check-access').then((r) => r.json()).catch(() => ({ authorized: false }))
      if (!accessCheck.authorized) {
        setLoading(false)
        return
      }
      const res = await fetch('/api/admin/property-compliance')
      const data = await res.json()
      if (data.error) setError(data.error)
      else setProperties(data.properties || [])
      setLoading(false)
    }
    load()
  }, [])

  const sendReminder = async (property: any) => {
    const items = property.items
      .filter((i: any) => i.status === 'expired' || i.status === 'expiring_soon')
      .map((i: any) => ({ name: i.name, expired: i.status === 'expired', expiryDate: i.expiryDate }))
    if (items.length === 0) return
    setSendingId(property.propertyId)
    const res = await fetch('/api/admin/send-property-compliance-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: property.propertyId, items }),
    })
    setSendingId(null)
    if (res.ok) setSentIds((prev) => new Set(prev).add(property.propertyId))
    else setError('Could not send the reminder. Try again in a moment.')
  }

  const visible = filter === 'needs-attention' ? properties.filter((p) => p.needsAttention) : properties

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-2">Property compliance</h1>
      <p className="text-white/50 text-sm mb-8">
        Every property with a tracked compliance item (rental license, lead certification, inspections, insurance), and whether it&apos;s current, expiring, or expired. Nothing emails a landlord about this unless they happen to open their own property page — this is that visibility, with a manual nudge.
      </p>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : (
        <>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
          )}

          <ScrollReveal>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-white/70 font-semibold text-sm">Properties</h2>
              <div className="flex gap-1.5">
                {(['needs-attention', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={
                      filter === f
                        ? 'text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white'
                        : 'text-xs font-semibold px-3 py-1.5 rounded-full bg-white/5 text-white/50 hover:bg-white/8 transition'
                    }
                  >
                    {f === 'needs-attention' ? `Needs attention (${properties.filter((p) => p.needsAttention).length})` : `All (${properties.length})`}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="text-white/50 text-sm mb-8">
                {filter === 'needs-attention' ? 'Nothing expiring or expired right now.' : 'No properties have a tracked compliance item yet.'}
              </p>
            ) : (
              <div className="bg-white/3 border border-white/8 rounded-2xl divide-y divide-white/5 mb-8 overflow-hidden">
                {visible.map((p) => {
                  const expanded = expandedId === p.propertyId
                  const sent = sentIds.has(p.propertyId)
                  return (
                    <div key={p.propertyId}>
                      <button
                        onClick={() => setExpandedId(expanded ? null : p.propertyId)}
                        className="w-full flex items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-white/5 transition"
                      >
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{p.address}{p.city ? `, ${p.city}` : ''}</p>
                          <p className="text-white/40 text-xs truncate">{p.ownerName} · {p.ownerEmail}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {p.expiredCount > 0 && <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-red-500/15 text-red-400">{p.expiredCount} expired</span>}
                          {p.expiringSoonCount > 0 && <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-yellow-500/15 text-yellow-400">{p.expiringSoonCount} expiring</span>}
                          {p.expiredCount === 0 && p.expiringSoonCount === 0 && (
                            <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-[#0A7B7E]/20 text-[#12A5A9]">{p.currentCount} current</span>
                          )}
                        </div>
                      </button>
                      {expanded && (
                        <div className="px-5 pb-4">
                          <div className="space-y-1.5 mb-3">
                            {p.items.map((i: any) => (
                              <div key={i.id} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-white/70">{i.name}</span>
                                <span className={
                                  i.status === 'current' ? 'text-[#12A5A9] font-semibold' :
                                  i.status === 'expiring_soon' ? 'text-yellow-400 font-semibold' :
                                  i.status === 'expired' ? 'text-red-400 font-semibold' :
                                  'text-white/40 font-semibold'
                                }>
                                  {i.status === 'no_expiry' ? 'No expiry set' : i.status === 'expired' ? `Expired ${Math.abs(i.daysUntil)}d ago` : i.status === 'expiring_soon' ? `${i.daysUntil}d left` : 'Current'}
                                </span>
                              </div>
                            ))}
                          </div>
                          {p.needsAttention && (
                            <RippleButton
                              onClick={() => sendReminder(p)}
                              disabled={sendingId === p.propertyId || sent}
                              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                            >
                              {sent ? 'Reminder sent ✓' : sendingId === p.propertyId ? 'Sending...' : 'Send reminder (email + app)'}
                            </RippleButton>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}
