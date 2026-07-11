'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
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
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<any[]>([])
  const [activeFilter, setActiveFilter] = useState(searchParams.get('filter') || 'needs_approval')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [showBiddingModal, setShowBiddingModal] = useState(false)
  const [biddingJobId, setBiddingJobId] = useState<string | null>(null)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineJobId, setDeclineJobId] = useState<string | null>(null)
  const [declineNote, setDeclineNote] = useState('')

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

  const handleApproveClick = async (jobId: string) => {
    setActioningId(jobId)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'approved' })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error acknowledging job:', updateError)
      setError('Could not acknowledge job.')
      setActioningId(null)
      return
    }

    setActioningId(null)
    setBiddingJobId(jobId)
    setShowBiddingModal(true)
  }

  const confirmStartBidding = async () => {
    if (!biddingJobId) return
    setActioningId(biddingJobId)

    const { error: biddingError } = await supabase
      .from('jobs')
      .update({ status: 'bidding' })
      .eq('id', biddingJobId)

    if (biddingError) {
      console.error('Error starting bidding:', biddingError)
      setError('Acknowledged, but could not start bidding.')
    }

    setShowBiddingModal(false)
    setBiddingJobId(null)
    await fetchJobs()
    setActioningId(null)
  }

  const skipBidding = async () => {
    setShowBiddingModal(false)
    setBiddingJobId(null)
    await fetchJobs()
  }

  const handleDeclineClick = (jobId: string) => {
    setDeclineJobId(jobId)
    setDeclineNote('')
    setShowDeclineModal(true)
  }

  const confirmDecline = async () => {
    if (!declineJobId) return
    setActioningId(declineJobId)

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'declined', landlord_notes: declineNote || null })
      .eq('id', declineJobId)

    if (updateError) {
      console.error('Error declining job:', updateError)
      setError('Could not decline job.')
    }

    setShowDeclineModal(false)
    setDeclineJobId(null)
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

  const statusLabel = (job: any) => {
    const labels: Record<string, string> = {
      pending_approval: 'Needs approval',
      approved: 'Acknowledged',
      bidding: 'Bidding',
      bid_selected: 'Bid selected',
      scheduled: 'Scheduled',
      in_progress: 'In progress',
      completed: 'Completed',
      archived: 'Archived',
      declined: 'Declined',
    }
    const base = labels[job.status] || job.status

    if (job.proposed_date && !job.schedule_confirmed) {
      const proposer = job.proposed_by === 'landlord' ? 'you' : job.proposed_by
      return `${base} · New time proposed by ${proposer}`
    }

    return base
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
                      <span className="text-xs text-white/30">{statusLabel(job)}</span>
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
                        onClick={() => handleApproveClick(job.id)}
                        disabled={actioningId === job.id}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => handleDeclineClick(job.id)}
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

      {showBiddingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Job acknowledged ✓</h3>
            <p className="text-white/50 text-sm mb-6">
              Let contractors within range start submitting sealed bids on this job?
            </p>
            <div className="flex gap-3">
              <button
                onClick={skipBidding}
                disabled={actioningId !== null}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Not yet
              </button>
              <button
                onClick={confirmStartBidding}
                disabled={actioningId !== null}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioningId ? 'Starting...' : 'Start bidding'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeclineModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Decline this job?</h3>
            <p className="text-white/50 text-sm mb-3">
              Optionally let the renter know why.
            </p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              rows={3}
              placeholder="e.g. Already scheduled with our regular contractor"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-5"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeclineModal(false)}
                disabled={actioningId !== null}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDecline}
                disabled={actioningId !== null}
                className="flex-1 bg-red-500/20 text-red-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-500/30 transition disabled:opacity-50"
              >
                {actioningId ? 'Declining...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}