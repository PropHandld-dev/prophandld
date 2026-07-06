'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const FILTERS = [
  { key: 'needs_approval', label: 'Needs Approval' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'all', label: 'All' },
]

const IN_PROGRESS_STATUSES = ['approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress']

export default function LandlordJobsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<any[]>([])
  const [activeFilter, setActiveFilter] = useState('needs_approval')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: jobsData, error: jobsError } = await supabase
      .from('jobs')
      .select('*, units(unit_number, property_id, properties(address, city, state))')
      .order('created_at', { ascending: false })

    if (jobsError) {
      console.error('Error loading jobs:', jobsError)
      setError('Could not load jobs.')
      setLoading(false)
      return
    }

    const jobsList = jobsData || []

    const enriched = await Promise.all(
      jobsList.map(async (job) => {
        const { data: reporterData } = await supabase
          .rpc('get_user_by_id', { user_id_input: job.reported_by })
          .maybeSingle()
        return { ...job, reporter: reporterData }
      })
    )

    setJobs(enriched)
    setLoading(false)
  }

  useEffect(() => {
    fetchJobs()
  }, [router])

  const handleApprove = async (jobId: string) => {
    setActioningId(jobId)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'approved' })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error approving job:', updateError)
      setError('Could not approve job.')
    }

    await fetchJobs()
    setActioningId(null)
  }

  const handleDecline = async (jobId: string) => {
    const note = window.prompt('Optional note to the renter about why this was declined:')
    setActioningId(jobId)

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'declined', landlord_notes: note || null })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error declining job:', updateError)
      setError('Could not decline job.')
    }

    await fetchJobs()
    setActioningId(null)
  }

  const filteredJobs = jobs.filter((job) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'emergency') return job.is_emergency
    if (activeFilter === 'needs_approval') return job.status === 'pending_approval'
    if (activeFilter === 'in_progress') return IN_PROGRESS_STATUSES.includes(job.status)
    if (activeFilter === 'completed') return job.status === 'completed' || job.status === 'archived'
    return true
  })

  const urgencyBadge = (job: any) => {
    if (job.is_emergency) {
      return <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2.5 py-1 font-semibold">Emergency</span>
    }
    const colors: Record<string, string> = {
      high: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
      normal: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
      low: 'bg-white/8 text-white/50 border-white/10',
    }
    return (
      <span className={`text-xs rounded-full px-2.5 py-1 border capitalize ${colors[job.urgency] || colors.low}`}>
        {job.urgency}
      </span>
    )
  }

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending_approval: 'Needs approval',
      approved: 'Approved',
      bidding: 'Bidding',
      bid_selected: 'Bid selected',
      scheduled: 'Scheduled',
      in_progress: 'In progress',
      completed: 'Completed',
      archived: 'Archived',
      declined: 'Declined',
    }
    return labels[status] || status
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-24" />
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-6">Jobs</h1>

        <div className="flex flex-wrap gap-2 mb-8">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={
                activeFilter === f.key
                  ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-full transition'
                  : 'bg-white/5 text-white/50 text-sm font-medium px-4 py-2 rounded-full hover:bg-white/8 transition'
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {filteredJobs.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-12 text-center">
            <p className="text-white/40 text-sm">No jobs in this view.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredJobs.map((job) => (
              <div key={job.id} className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 transition">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/landlord/jobs/${job.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h3 className="text-white font-semibold">{job.category}</h3>
                      {urgencyBadge(job)}
                      <span className="text-xs text-white/30">{statusLabel(job.status)}</span>
                    </div>
                    <p className="text-white/60 text-sm">{job.description}</p>
                    <p className="text-white/30 text-xs mt-2">
                      {job.units?.properties?.address}, {job.units?.properties?.city} · Unit {job.units?.unit_number}
                    </p>
                    <p className="text-white/30 text-xs mt-0.5">
                      Reported by {job.reporter?.full_name || 'Unknown'} · {new Date(job.created_at).toLocaleString()}
                    </p>
                    {job.landlord_notes && (
                      <p className="text-white/40 text-xs mt-2 italic">Note: {job.landlord_notes}</p>
                    )}
                  </Link>

                  {job.status === 'pending_approval' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(job.id)}
                        disabled={actioningId === job.id}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDecline(job.id)}
                        disabled={actioningId === job.id}
                        className="text-red-400/70 hover:text-red-400 text-xs transition"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
