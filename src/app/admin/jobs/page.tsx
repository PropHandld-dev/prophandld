'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

const STATUSES = [
  'all', 'pending_approval', 'approved', 'bidding', 'bid_selected', 'scheduled',
  'in_progress', 'pending_review', 'completed', 'archived', 'declined', 'disputed',
]

export default function AdminJobsPage() {
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, category, status, is_emergency, created_at, units(unit_number, properties(address, city))')
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) console.error('Error loading jobs:', error)
      setJobs(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = statusFilter === 'all' ? jobs : jobs.filter((j) => j.status === statusFilter)

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-8">Jobs ({jobs.length})</h1>

      <div className="mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} className="bg-[#0C1A2E] capitalize">
              {s === 'all' ? 'All statuses' : s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : (
        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-white/30 text-sm p-6">No jobs match.</p>
          ) : (
            filtered.map((j) => {
              const property = (j.units as any)?.properties
              return (
                <div key={j.id} className="flex items-center justify-between px-6 py-4 border-b border-white/5 last:border-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium truncate">{j.category}</p>
                      {j.is_emergency && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 rounded-full px-2 py-0.5 font-semibold shrink-0">
                          Emergency
                        </span>
                      )}
                    </div>
                    <p className="text-white/40 text-xs truncate">
                      {property?.address}{property?.city ? `, ${property.city}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs bg-white/8 text-white/60 rounded-full px-2.5 py-0.5 capitalize">
                      {j.status.replace('_', ' ')}
                    </span>
                    <span className="text-white/30 text-xs">{new Date(j.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              )
            })
          )}
        </ScrollReveal>
      )}
    </AdminLayout>
  )
}
