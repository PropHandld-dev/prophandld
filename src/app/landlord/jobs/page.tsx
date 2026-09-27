'use client'

import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { expectRow } from '@/lib/expectRow'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { CheckCircleIcon, ClipboardListIcon, MessageCircleIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { UnreadDot } from '@/components/UnreadDot'
import { getUnreadJobIds } from '@/lib/messageReads'
import { fetchAllPages } from '@/lib/pagedQuery'
import { useLanguage, t } from '@/lib/i18n'

const IN_PROGRESS_STATUSES = ['approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress']

function LandlordJobsList() {
  const router = useRouter()
  const lang = useLanguage()
  const FILTERS = [
    { key: 'needs_approval', label: t('filterNeedsAction', lang) },
    { key: 'in_progress', label: t('filterInProgress', lang) },
    { key: 'completed', label: t('filterCompleted', lang) },
    { key: 'emergency', label: t('filterEmergency', lang) },
    { key: 'all', label: t('filterAll', lang) },
  ]
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<any[]>([])
  const [unreadJobIds, setUnreadJobIds] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState(searchParams.get('filter') || 'needs_approval')
  const [search, setSearch] = useState('')
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
      router.replace('/login')
      return
    }

    // Paged: this has no date bound (unlike the rent roll or the crons),
    // so a landlord with enough job history — not a scale concern today,
    // but a real one over years of real use — would otherwise silently
    // stop seeing their oldest jobs once the table crossed 1000 rows,
    // with nothing on screen to say so.
    const { data: jobsList, error: jobsError } = await fetchAllPages<any>((from, to) =>
      supabase
        .from('jobs')
        .select('*, units(unit_number, property_id, properties(address, city, state))')
        .order('created_at', { ascending: false })
        .range(from, to)
    )

    if (jobsError) {
      console.error('Error loading jobs:', jobsError)
      setError(t('couldNotLoadJobs', lang))
      setLoading(false)
      return
    }

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

    getUnreadJobIds(jobsList.map((j) => j.id), user.id).then(setUnreadJobIds)
  }

  useEffect(() => {
    fetchJobs()
  }, [router])

  const handleApproveClick = async (jobId: string) => {
    setActioningId(jobId)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'approved' })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error acknowledging job:', updateError)
      setError(t('couldNotAcknowledgeJob', lang))
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

    const { error: biddingError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'bidding' })
      .eq('id', biddingJobId))

    if (biddingError) {
      console.error('Error starting bidding:', biddingError)
      setError(t('acknowledgedButNoBidding', lang))
    } else {
      notify('job_open', biddingJobId)
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

    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'declined', landlord_notes: declineNote || null })
      .eq('id', declineJobId))

    if (updateError) {
      console.error('Error declining job:', updateError)
      setError(t('couldNotDeclineJob', lang))
    }

    setShowDeclineModal(false)
    setDeclineJobId(null)
    await fetchJobs()
    setActioningId(null)
  }

  const statusFilteredJobs = jobs.filter((job) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'emergency') return job.is_emergency
    if (activeFilter === 'needs_approval') return ['pending_approval', 'approved', 'pending_review'].includes(job.status)
    if (activeFilter === 'in_progress') return IN_PROGRESS_STATUSES.includes(job.status)
    if (activeFilter === 'completed') return job.status === 'completed' || job.status === 'archived'
    return true
  })

  // Search narrows within whichever status filter is active, not instead
  // of it — the two work together, same as the rent roll's search and
  // date range both apply at once rather than one replacing the other.
  const searchQuery = search.trim().toLowerCase()
  const filteredJobs = !searchQuery
    ? statusFilteredJobs
    : statusFilteredJobs.filter((job) =>
        [job.category, job.description, job.units?.properties?.address, job.units?.properties?.city, job.units?.unit_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(searchQuery))
      )

  const urgencyBadge = (job: any) => {
    if (job.is_emergency) {
      return <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2.5 py-1 font-semibold">{t('emergency', lang)}</span>
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
  pending_approval: t('statusNeedsApproval', lang),
  approved: t('statusAcknowledged', lang),
  bidding: t('statusBidding', lang),
  bid_selected: t('statusBidSelected', lang),
  scheduled: t('statusScheduledFull', lang),
  in_progress: t('statusInProgressFull', lang),
  pending_review: t('statusPendingYourReview', lang),
  completed: t('statusCompleted', lang),
  archived: t('statusArchived', lang),
  declined: t('statusDeclined', lang),
}
    const base = labels[job.status] || job.status

    if (job.proposed_date && !job.schedule_confirmed) {
      const proposer = job.proposed_by === 'landlord' ? t('you', lang) : job.proposed_by
      return `${base} · ${lang === 'es' ? `Nuevo horario propuesto por ${proposer}` : `New time proposed by ${proposer}`}`
    }

    return base
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-24" />
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-10 pb-28">
        <Skeleton className="h-8 w-24 mb-6" />
        <div className="flex flex-wrap gap-2 mb-8">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}
        </div>
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </main>
      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-24" />
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-6">{t('jobsTitle', lang)}</h1>

        <div className="flex flex-wrap gap-2 mb-4">
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

        {jobs.length > 0 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchJobsPlaceholder', lang)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition mb-6"
          />
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {filteredJobs.length === 0 ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-12 text-center">
            <ClipboardListIcon className="w-8 h-8 text-white/50 mx-auto mb-3" />
            <p className="text-white/60 text-sm">{searchQuery ? t('noJobsMatchSearch', lang) : t('noJobsInView', lang)}</p>
          </div>
        ) : (
          <ScrollReveal className="grid gap-3">
            {filteredJobs.map((job) => (
              <div key={job.id} className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/landlord/jobs/${job.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h3 className="text-white font-semibold">{job.category}</h3>
                      {urgencyBadge(job)}
                      <span className="text-xs text-white/50">{statusLabel(job)}</span>
                      {unreadJobIds.has(job.id) && (
                        <span className="inline-flex items-center gap-1 text-[#12A5A9]">
                          <MessageCircleIcon className="w-3.5 h-3.5" />
                          <UnreadDot />
                        </span>
                      )}
                    </div>
                    <p className="text-white/60 text-sm">{job.description}</p>
                    <p className="text-white/50 text-xs mt-2">
                      {job.units?.properties?.address}, {job.units?.properties?.city} · Unit {job.units?.unit_number}
                    </p>
                    <p className="text-white/50 text-xs mt-0.5">
                      {t('reportedBy', lang)} {job.reporter?.full_name || t('unknownName', lang)} · {new Date(job.created_at).toLocaleString()}
                    </p>
                    {job.landlord_notes && (
                      <p className="text-white/60 text-xs mt-2 italic">{t('noteLabel', lang)} {job.landlord_notes}</p>
                    )}
                  </Link>

                  {job.status === 'pending_approval' && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <RippleButton
                        onClick={() => handleApproveClick(job.id)}
                        disabled={actioningId === job.id}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                      >
                        {t('acknowledge', lang)}
                      </RippleButton>
                      <button
                        onClick={() => handleDeclineClick(job.id)}
                        disabled={actioningId === job.id}
                        className="text-red-400/70 hover:text-red-400 text-xs transition"
                      >
                        {t('decline', lang)}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </ScrollReveal>
        )}
      </main>

      {showBiddingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" /> {t('jobAcknowledged', lang)}
            </h3>
            <p className="text-white/50 text-sm mb-6">
              {t('letContractorsBid', lang)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={skipBidding}
                disabled={actioningId !== null}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('notYet', lang)}
              </button>
              <button
                onClick={confirmStartBidding}
                disabled={actioningId !== null}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioningId ? t('starting', lang) : t('startBidding', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeclineModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">{t('declineThisJob', lang)}</h3>
            <p className="text-white/50 text-sm mb-3">
              {t('optionallyLetRenterKnow', lang)}
            </p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              rows={3}
              placeholder={t('declineNotePlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-5"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeclineModal(false)}
                disabled={actioningId !== null}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
              </button>
              <button
                onClick={confirmDecline}
                disabled={actioningId !== null}
                className="flex-1 bg-red-500/20 text-red-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-500/30 transition disabled:opacity-50"
              >
                {actioningId ? t('declining', lang) : t('decline', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}

export default function LandlordJobsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0C1A2E]">
        <main className="max-w-4xl mx-auto px-6 py-10 pb-28">
          <Skeleton className="h-8 w-24 mb-6" />
          <Skeleton className="h-24" />
        </main>
      </div>
    }>
      <LandlordJobsList />
    </Suspense>
  )
}