'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { AlertsList, type AlertItem } from '@/components/AlertsList'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { MagneticLink } from '@/components/MagneticLink'
import { CountUp } from '@/components/CountUp'
import { EnableNotificationsCard } from '@/components/EnableNotificationsCard'
import { UnreadDot } from '@/components/UnreadDot'
import { getUnreadJobIds } from '@/lib/messageReads'
import {
  CalendarIcon, ClipboardListIcon, WrenchIcon,
  DollarSignIcon, AlertTriangleIcon, CheckCircleIcon,
} from '@/components/icons'
import { CONTRACTOR_TABS } from '@/lib/navTabs'

const TIME_WINDOWS: Record<string, string> = {
  morning: 'Morning (8am–12pm)',
  afternoon: 'Afternoon (12pm–5pm)',
  evening: 'Evening (5pm–8pm)',
}

const PAST_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
]

export default function ContractorDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(true)
  const [availableJobs, setAvailableJobs] = useState<any[]>([])
  const [myBids, setMyBids] = useState<any[]>([])
  const [pickTimeAlerts, setPickTimeAlerts] = useState<any[]>([])
  const [scheduleAlerts, setScheduleAlerts] = useState<any[]>([])
  const [confirmedAlerts, setConfirmedAlerts] = useState<any[]>([])
  const [clarificationAlerts, setClarificationAlerts] = useState<any[]>([])
  const [upcoming, setUpcoming] = useState<any[]>([])
  const [pastJobs, setPastJobs] = useState<any[]>([])
  const [unreadJobIds, setUnreadJobIds] = useState<Set<string>>(new Set())
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [connectStatus, setConnectStatus] = useState<'not_started' | 'onboarding' | 'active'>('not_started')
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'verified' | 'rejected' | 'unlicensed' | null>(null)
  const [pastFilter, setPastFilter] = useState('all')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUser(user)

      const { data: profileData } = await supabase
        .from('users')
        .select('service_categories, service_zip, stripe_connect_status')
        .eq('id', user.id)
        .maybeSingle()

      if (!profileData?.service_categories?.length || !profileData?.service_zip) {
        setHasProfile(false)
        setLoading(false)
        return
      }

      setConnectStatus((profileData.stripe_connect_status as any) || 'not_started')

      const { data: verificationData } = await supabase
        .from('contractor_verifications')
        .select('status')
        .eq('contractor_user_id', user.id)
        .maybeSingle()
      setVerificationStatus(verificationData?.status ?? null)

      try {
        const jobsRes = await fetch('/api/contractor/available-jobs')
        const jobsData = await jobsRes.json()
        if (!jobsRes.ok) {
          console.error('Error loading available jobs:', jobsData)
        } else {
          setAvailableJobs(jobsData.jobs || [])
        }
      } catch (err) {
        console.error('Error loading available jobs:', err)
      }

      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('*, jobs(id, category, description, status, unit_id, proposed_date, proposed_window, proposed_by, schedule_confirmed, clarification_note, clarification_response, units(unit_number, properties(address, city)))')
        .eq('contractor_user_id', user.id)
        .order('created_at', { ascending: false })

      if (bidsError) {
        console.error('Error loading bids:', bidsError)
      } else {
        const bids = bidsData || []
        setMyBids(bids)

        const acceptedJobIds = bids.filter((b) => b.status === 'accepted').map((b) => b.job_id)
        getUnreadJobIds(acceptedJobIds, user.id).then(setUnreadJobIds)

        setTotalEarnings(
          bids
            .filter((b) => b.payment_status === 'paid')
            .reduce((sum, b) => sum + Number(b.proposed_amount ?? b.amount ?? 0), 0)
        )

        setPickTimeAlerts(
          bids.filter((b) =>
            b.status === 'accepted' && b.jobs?.status === 'bid_selected' && !b.jobs?.proposed_date
          )
        )

        setScheduleAlerts(
          bids.filter((b) =>
            b.jobs?.proposed_date &&
            !b.jobs?.schedule_confirmed &&
            b.jobs?.proposed_by !== 'contractor' &&
            ['bid_selected', 'scheduled'].includes(b.jobs?.status)
          )
        )

        setConfirmedAlerts(
          bids.filter((b) => b.jobs?.status === 'scheduled' && b.jobs?.schedule_confirmed)
        )

        setClarificationAlerts(
          bids.filter((b) =>
            b.jobs?.status === 'pending_review' &&
            b.jobs?.clarification_note &&
            !b.jobs?.clarification_response
          )
        )

        setUpcoming(
          bids
            .filter((b) => b.jobs?.status === 'scheduled' && b.jobs?.schedule_confirmed && b.jobs?.proposed_date)
            .sort((a, b) => new Date(a.jobs.proposed_date).getTime() - new Date(b.jobs.proposed_date).getTime())
        )

        setPastJobs(
          bids.filter((b) => ['completed', 'archived'].includes(b.jobs?.status))
        )
      }

      setLoading(false)
    }
    init()
  }, [router])

  const activeJobsCount = myBids.filter((b) => b.status === 'accepted').length

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const jobLocation = (bid: any) => {
    const address = bid.jobs?.units?.properties?.address
    const city = bid.jobs?.units?.properties?.city
    if (!address && !city) return 'Address not set for this property'
    return [address, city].filter(Boolean).join(', ')
  }

  const filteredPastJobs = pastJobs.filter((b) => {
    if (pastFilter === 'all') return true
    return b.jobs?.status === pastFilter
  })

  const alertItems: AlertItem[] = [
    ...clarificationAlerts.map((bid) => ({
      id: `clarify-${bid.id}`,
      icon: AlertTriangleIcon,
      tone: 'yellow' as const,
      title: bid.jobs?.category,
      subtitle: 'Landlord asked for verification',
      href: `/contractor/jobs/${bid.job_id}`,
      badge: 'Respond',
    })),
    ...pickTimeAlerts.map((bid) => ({
      id: `pick-${bid.id}`,
      icon: CalendarIcon,
      tone: 'yellow' as const,
      title: bid.jobs?.category,
      subtitle: jobLocation(bid),
      href: `/contractor/jobs/${bid.job_id}`,
      badge: 'Propose a time',
    })),
    ...scheduleAlerts.map((bid) => ({
      id: `sched-${bid.id}`,
      icon: CalendarIcon,
      tone: 'yellow' as const,
      title: bid.jobs?.category,
      subtitle: jobLocation(bid),
      href: `/contractor/jobs/${bid.job_id}`,
      badge: 'Review',
    })),
    ...confirmedAlerts.map((bid) => ({
      id: `confirmed-${bid.id}`,
      icon: CheckCircleIcon,
      tone: 'teal' as const,
      title: bid.jobs?.category,
      subtitle: jobLocation(bid),
      href: `/contractor/jobs/${bid.job_id}`,
      badge: 'Start job',
    })),
  ]

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold">Prophandld</span>
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5">Contractor</span>
        </div>
        <span className="text-white/50 text-sm">{user?.user_metadata?.full_name}</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-4 w-56" />
            <div className="grid grid-cols-3 gap-4 mt-4">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
            <Skeleton className="h-32" />
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white">
                Welcome, {user?.user_metadata?.full_name?.split(' ')[0]}
              </h1>
              <p className="text-white/50 mt-1">Find jobs and manage your bids.</p>
            </div>

            {!hasProfile ? (
              <div className="bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-2xl p-6 mb-6">
                <h3 className="text-white font-semibold mb-1">Set up your service profile</h3>
                <p className="text-white/50 text-sm mb-4">
                  Tell us what you do and where, so we can start matching you to jobs.
                </p>
                <MagneticLink
                  href="/contractor/settings"
                  className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:opacity-90 transition"
                >
                  Set up now
                </MagneticLink>
              </div>
            ) : (
              <>
                <AlertsList items={alertItems} />
                <EnableNotificationsCard />

                <ScrollReveal className="grid grid-cols-3 gap-4 mb-6">
                  <a href="#available-jobs" className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                    <ClipboardListIcon className="w-5 h-5 text-[#12A5A9] mx-auto mb-1" />
                    <CountUp value={availableJobs.length} className="text-2xl font-bold text-white block" />
                    <div className="text-white/40 text-xs mt-1">New Jobs</div>
                  </a>
                  <a href="#your-bids" className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                    <WrenchIcon className="w-5 h-5 text-[#12A5A9] mx-auto mb-1" />
                    <CountUp value={activeJobsCount} className="text-2xl font-bold text-white block" />
                    <div className="text-white/40 text-xs mt-1">Active</div>
                  </a>
                  <Link href="/contractor/settings" className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                    <DollarSignIcon className="w-5 h-5 text-[#12A5A9] mx-auto mb-1" />
                    <div className="text-2xl font-bold text-white">${totalEarnings.toLocaleString()}</div>
                    <div className="text-white/40 text-xs mt-1">Earnings</div>
                  </Link>
                </ScrollReveal>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <Link
                    href="/contractor/settings"
                    className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block"
                  >
                    <DollarSignIcon className={`w-5 h-5 mx-auto mb-1 ${connectStatus === 'active' ? 'text-[#12A5A9]' : 'text-white/40'}`} />
                    <h3 className="text-white text-sm font-semibold">Payouts</h3>
                    <p className={`text-xs mt-0.5 ${connectStatus === 'active' ? 'text-[#12A5A9]' : 'text-white/40'}`}>
                      {connectStatus === 'active' ? 'Active' : connectStatus === 'onboarding' ? 'Finish setup' : 'Set up payouts'}
                    </p>
                  </Link>
                  <Link
                    href="/contractor/settings"
                    className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block"
                  >
                    <CheckCircleIcon className={`w-5 h-5 mx-auto mb-1 ${verificationStatus === 'verified' ? 'text-[#12A5A9]' : 'text-white/40'}`} />
                    <h3 className="text-white text-sm font-semibold">Verification</h3>
                    <p className={`text-xs mt-0.5 ${verificationStatus === 'verified' ? 'text-[#12A5A9]' : 'text-white/40'}`}>
                      {verificationStatus === 'verified' ? 'Verified ✓' : verificationStatus === 'pending' ? 'Under review' : verificationStatus === 'unlicensed' ? 'Unlicensed' : 'Get verified'}
                    </p>
                  </Link>
                </div>

                {upcoming.length > 0 && (
                  <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
                    <h3 className="text-white font-semibold mb-4">Upcoming</h3>
                    <div className="space-y-3">
                      {upcoming.map((bid) => (
                        <Link
                          key={bid.id}
                          href={`/contractor/jobs/${bid.job_id}`}
                          className="block border-b border-white/5 last:border-0 pb-3 last:pb-0 hover:opacity-80 transition"
                        >
                          <p className="text-white font-medium text-sm">{bid.jobs?.category}</p>
                          <p className="text-[#12A5A9] text-xs mt-1">
                            {new Date(bid.jobs.proposed_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · {TIME_WINDOWS[bid.jobs.proposed_window] || bid.jobs.proposed_window}
                          </p>
                          <p className="text-white/30 text-xs mt-0.5">{jobLocation(bid)}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <div id="available-jobs" className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 scroll-mt-6">
                  <h3 className="text-white font-semibold mb-4">Available jobs near you</h3>
                  {availableJobs.length === 0 ? (
                    <p className="text-white/30 text-sm">No jobs available right now — check back soon.</p>
                  ) : (
                    <div className="space-y-3">
                      {availableJobs.map((job) => (
                        <Link
                          key={job.id}
                          href={`/contractor/jobs/${job.id}/bid`}
                          className="block border-b border-white/5 last:border-0 pb-3 last:pb-0 hover:opacity-80 transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="text-white font-medium text-sm">{job.category}</p>
                              {job.is_emergency && (
                                <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-semibold">
                                  Emergency
                                </span>
                              )}
                            </div>
                            <span className="text-white/30 text-xs shrink-0">{formatDate(job.created_at)}</span>
                          </div>
                          <p className="text-white/50 text-xs">{job.description}</p>
                          <p className="text-white/30 text-xs mt-1">
                            {job.address}, {job.city} · Unit {job.unit_number}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div id="your-bids" className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 scroll-mt-6">
                  <h3 className="text-white font-semibold mb-4">Your bids</h3>
                  {myBids.length === 0 ? (
                    <p className="text-white/30 text-sm">You haven&apos;t submitted any bids yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {myBids.filter((b) => !['completed', 'archived'].includes(b.jobs?.status)).map((bid) => {
                        const hasPendingSchedule = bid.jobs?.proposed_date && !bid.jobs?.schedule_confirmed
                        const scheduleConfirmed = bid.jobs?.status === 'scheduled' && bid.jobs?.schedule_confirmed
                        return (
                          <Link
                            key={bid.id}
                            href={`/contractor/jobs/${bid.job_id}`}
                            className="block border-b border-white/5 last:border-0 pb-3 last:pb-0 hover:opacity-80 transition"
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <p className="text-white font-medium text-sm">{bid.jobs?.category}</p>
                                {bid.status === 'accepted' && unreadJobIds.has(bid.job_id) && <UnreadDot />}
                              </span>
                              <span className={
                                bid.status === 'accepted'
                                  ? 'text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5'
                                  : bid.status === 'declined'
                                  ? 'text-xs bg-white/5 text-white/30 border border-white/10 rounded-full px-2 py-0.5'
                                  : 'text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 rounded-full px-2 py-0.5'
                              }>
                                {bid.status === 'accepted' ? 'Selected' : bid.status === 'declined' ? 'Not selected' : 'Pending'}
                              </span>
                            </div>
                            <p className="text-white/30 text-xs mt-1">{jobLocation(bid)}</p>
                            <p className="text-white/50 text-xs mt-1">Your bid: ${bid.amount}</p>
                            {bid.status === 'accepted' && bid.selected_at && (
                              <p className="text-white/30 text-xs mt-0.5">
                                Selected {new Date(bid.selected_at).toLocaleString()}
                              </p>
                            )}
                            {scheduleConfirmed && (
                              <p className="text-[#12A5A9] text-xs mt-1 font-medium">✓ Schedule confirmed</p>
                            )}
                            {hasPendingSchedule && !scheduleConfirmed && (
                              <p className="text-yellow-400 text-xs mt-1 font-medium">
                                New time proposed{bid.jobs?.proposed_by !== 'contractor' ? ' — awaiting your response' : ''}
                              </p>
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold">Past jobs</h3>
                    <div className="flex gap-1.5">
                      {PAST_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setPastFilter(f.key)}
                          className={
                            pastFilter === f.key
                              ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-1.5 rounded-full transition'
                              : 'bg-white/5 text-white/50 text-xs font-medium px-3 py-1.5 rounded-full hover:bg-white/8 transition'
                          }
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filteredPastJobs.length === 0 ? (
                    <p className="text-white/30 text-sm">No past jobs in this view.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredPastJobs.map((bid) => (
                        <Link
                          key={bid.id}
                          href={`/contractor/jobs/${bid.job_id}`}
                          className="block border-b border-white/5 last:border-0 pb-3 last:pb-0 hover:opacity-80 transition"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-white font-medium text-sm">{bid.jobs?.category}</p>
                            <span className="text-xs text-white/30 capitalize">{bid.jobs?.status}</span>
                          </div>
                          <p className="text-white/30 text-xs mt-1">{jobLocation(bid)}</p>
                          <p className="text-white/50 text-xs mt-1">${bid.amount}</p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>

      <BottomTabBar tabs={CONTRACTOR_TABS} />
    </div>
  )
}
