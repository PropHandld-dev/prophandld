'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type Review = {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  reviewerName: string
  reviewerEmail: string | null
}

type Org = {
  id: string
  name: string
  slug: string | null
  openToClients: boolean
  pitch: string | null
  createdAt: string
  adminName: string
  adminEmail: string | null
  acceptedClients: number
  pendingClients: number
  staffCount: number
  reviews: Review[]
}

export default function AdminPropertyManagersPage() {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/property-managers')
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not load')
      setLoading(false)
      return
    }
    setOrgs(data.organizations || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleToggleListing = async (org: Org) => {
    setBusyId(org.id)
    await fetch(`/api/admin/property-managers/${org.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openToClients: !org.openToClients }),
    }).catch(() => {})
    await load()
    setBusyId(null)
  }

  const handleRemoveReview = async (reviewId: string) => {
    if (!confirm('Remove this review? This cannot be undone.')) return
    setBusyId(reviewId)
    await fetch(`/api/admin/pm-reviews/${reviewId}`, { method: 'DELETE' }).catch(() => {})
    await load()
    setBusyId(null)
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-1">Property managers</h1>
      <p className="text-white/50 text-sm mb-8">
        Every PM organization, public profiles, and client reviews. Taking a profile offline or
        removing a review doesn&apos;t touch any client relationship or data.
      </p>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">{error}</div>}

      {loading ? (
        <div className="text-white/40 text-sm">Loading...</div>
      ) : orgs.length === 0 ? (
        <p className="text-white/40 text-sm">No property management organizations yet.</p>
      ) : (
        <div className="space-y-3">
          {orgs.map((org) => (
            <ScrollReveal key={org.id} className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId((cur) => (cur === org.id ? null : org.id))}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-white font-semibold">{org.name}</span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        org.openToClients ? 'bg-[#12A5A9]/15 text-[#12A5A9]' : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {org.openToClients ? 'Public' : 'Not listed'}
                    </span>
                    {org.reviews.length > 0 && <span className="text-xs text-white/40">{org.reviews.length} review{org.reviews.length === 1 ? '' : 's'}</span>}
                  </div>
                  <p className="text-white/40 text-xs mt-1">
                    Admin: {org.adminName} ({org.adminEmail}) · {org.acceptedClients} client{org.acceptedClients === 1 ? '' : 's'}
                    {org.pendingClients > 0 && `, ${org.pendingClients} pending`} · {org.staffCount} staff
                  </p>
                </div>
              </button>

              {expandedId === org.id && (
                <div className="px-5 pb-5 border-t border-white/8 pt-4">
                  {org.pitch && <p className="text-white/60 text-sm mb-4">&ldquo;{org.pitch}&rdquo;</p>}

                  <div className="flex items-center gap-3 mb-5 flex-wrap">
                    {org.slug && (
                      <Link href={`/property-managers/${org.slug}`} target="_blank" className="text-[#12A5A9] text-xs font-semibold hover:underline">
                        View public profile →
                      </Link>
                    )}
                    <button
                      onClick={() => handleToggleListing(org)}
                      disabled={busyId === org.id}
                      className="text-red-400/80 hover:text-red-400 text-xs font-semibold disabled:opacity-50"
                    >
                      {org.openToClients ? 'Take listing offline' : 'Allow public listing again'}
                    </button>
                  </div>

                  {org.reviews.length > 0 && (
                    <>
                      <p className="text-white/40 text-xs uppercase tracking-wide mb-2">Reviews</p>
                      <div className="space-y-2">
                        {org.reviews.map((r) => (
                          <div key={r.id} className="bg-white/[0.03] border border-white/8 rounded-xl p-3.5">
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <span className="text-yellow-400 text-xs">{'★'.repeat(r.rating)}<span className="text-white/15">{'★'.repeat(5 - r.rating)}</span></span>
                              <button
                                onClick={() => handleRemoveReview(r.id)}
                                disabled={busyId === r.id}
                                className="text-red-400/70 hover:text-red-400 text-xs disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                            {r.comment && <p className="text-white/70 text-sm mb-1">{r.comment}</p>}
                            <p className="text-white/30 text-xs">
                              {r.reviewerName} ({r.reviewerEmail}) · {new Date(r.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </ScrollReveal>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
