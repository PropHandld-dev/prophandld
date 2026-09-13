'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ContractorDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState(true)
  const [availableJobs, setAvailableJobs] = useState<any[]>([])
  const [myBids, setMyBids] = useState<any[]>([])
  const [scheduleAlerts, setScheduleAlerts] = useState<any[]>([])
  const [confirmedAlerts, setConfirmedAlerts] = useState<any[]>([])
  const [clarificationAlerts, setClarificationAlerts] = useState<any[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      const { data: profileData } = await supabase
        .from('users')
        .select('service_categories, service_zip')
        .eq('id', user.id)
        .maybeSingle()

      if (!profileData?.service_categories?.length || !profileData?.service_zip) {
        setHasProfile(false)
        setLoading(false)
        return
      }

      const { data: jobsData, error: jobsError } = await supabase
        .rpc('get_available_jobs_for_contractor')

      if (jobsError) {
        console.error('Error loading available jobs:', jobsError)
      } else {
        // Newest reported issues first
        const sorted = (jobsData || []).slice().sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        setAvailableJobs(sorted)
      }

      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('*, jobs(id, category, description, status, unit_id, proposed_date, proposed_by, schedule_confirmed, clarification_note, clarification_response, units(unit_number, properties(address, city)))')
        .eq('contractor_user_id', user.id)
        .order('created_at', { ascending: false })

      if (bidsError) {
        console.error('Error loading bids:', bidsError)
      } else {
        const bids = bidsData || []
        setMyBids(bids)

        // Schedule proposed by someone else, awaiting this contractor's response
        setScheduleAlerts(
          bids.filter((b) =>
            b.jobs?.proposed_date &&
            !b.jobs?.schedule_confirmed &&
            b.jobs?.proposed_by !== 'contractor' &&
            ['bid_selected', 'scheduled'].includes(b.jobs?.status)
          )
        )

        // Schedule just confirmed, ready to start
        setConfirmedAlerts(
          bids.filter((b) => b.jobs?.status === 'scheduled' && b.jobs?.schedule_confirmed)
        )

        // Landlord asked for verification, contractor hasn't responded yet
        setClarificationAlerts(
          bids.filter((b) =>
            b.jobs?.status === 'pending_review' &&
            b.jobs?.clarification_note &&
            !b.jobs?.clarification_response
          )
        )
      }

      setLoading(false)
    }
    init()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const activeJobsCount = myBids.filter((b) => b.status === 'accepted').length

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold">Prophandld</span>
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5">Contractor</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/50 text-sm">{user?.user_metadata?.full_name}</span>
          <Link href="/contractor/settings" className="text-white/40 hover:text-white text-sm transition">Settings</Link>
          <Link href="/profile" className="text-white/40 hover:text-white text-sm transition">Profile</Link>
          <button onClick={handleSignOut} className="text-white/40 hover:text-white text-sm transition">Sign out</button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">
            Welcome, {user?.user_metadata?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-white/50 mt-1">Find jobs and manage your bids.</p>
        </div>

        {!hasProfile ? (
          <div className="bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-2xl p-6 mb-6">
            <h3 className="text-white font-semibold mb-1">Set up your service profile</h3>
            <p className="text-white/50 text-sm mb-4">
              Tell us what you do and where, so we can start matching you to jobs.
            </p>
            <Link
              href="/contractor/settings"
              className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:opacity-90 transition"
            >
              Set up now
            </Link>
          </div>
        ) : (
          <>
            {clarificationAlerts.length > 0 && (
              <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-500/5 border border-yellow-500/30 rounded-2xl p-5 mb-4">
                <h3 className="text-yellow-400 font-semibold text-sm mb-3">
                  ❓ Landlord asked for verification
                </h3>
                <div className="space-y-2">
                  {clarificationAlerts.map((bid) => (
                    <Link
                      key={bid.id}
                      href={`/contractor/jobs/${bid.job_id}`}
                      className="flex items-center justify-between bg-white/5 hover:bg-white/8 rounded-xl px-4 py-3 transition"
                    >
                      <p className="text-white text-sm font-medium">{bid.jobs?.category}</p>
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 rounded-full px-3 py-1 font-semibold shrink-0">
                        Respond →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {scheduleAlerts.length > 0 && (
              <div className="bg-gradient-to-r from-blue-500/10 to-blue-500/5 border border-blue-400/30 rounded-2xl p-5 mb-4">
                <h3 className="text-blue-300 font-semibold text-sm mb-3">
                  🕐 {scheduleAlerts.length} new time proposed
                </h3>
                <div className="space-y-2">
                  {scheduleAlerts.map((bid) => (
                    <Link
                      key={bid.id}
                      href={`/contractor/jobs/${bid.job_id}`}
                      className="flex items-center justify-between bg-white/5 hover:bg-white/8 rounded-xl px-4 py-3 transition"
                    >
                      <p className="text-white text-sm font-medium">{bid.jobs?.category}</p>
                      <span className="text-xs bg-blue-400/20 text-blue-300 rounded-full px-3 py-1 font-semibold shrink-0">
                        Review →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {confirmedAlerts.length > 0 && (
              <div className="bg-gradient-to-r from-[#0A7B7E]/15 to-[#12A5A9]/5 border border-[#12A5A9]/30 rounded-2xl p-5 mb-4">
                <h3 className="text-[#12A5A9] font-semibold text-sm mb-3">
                  ✅ Schedule confirmed — ready to start
                </h3>
                <div className="space-y-2">
                  {confirmedAlerts.map((bid) => (
                    <Link
                      key={bid.id}
                      href={`/contractor/jobs/${bid.job_id}`}
                      className="flex items-center justify-between bg-white/5 hover:bg-white/8 rounded-xl px-4 py-3 transition"
                    >
                      <p className="text-white text-sm font-medium">{bid.jobs?.category}</p>
                      <span className="text-xs bg-[#12A5A9]/20 text-[#12A5A9] rounded-full px-3 py-1 font-semibold shrink-0">
                        Start job →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-6">
              <a href="#available-jobs" className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:bg-white/5 transition block">
                <div className="text-xl mb-1">🔔</div>
                <div className="text-2xl font-bold text-white">{availableJobs.length}</div>
                <div className="text-white/40 text-xs mt-1">New Jobs</div>
              </a>
              <a href="#your-bids" className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center hover:border-[#12A5A9]/30 hover:bg-white/5 transition block">
                <div className="text-xl mb-1">🔧</div>
                <div className="text-2xl font-bold text-white">{activeJobsCount}</div>
                <div className="text-white/40 text-xs mt-1">Active</div>
              </a>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4 text-center">
                <div className="text-xl mb-1">💰</div>
                <div className="text-2xl font-bold text-white">$0</div>
                <div className="text-white/40 text-xs mt-1">Earnings</div>
              </div>
            </div>

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

            <div id="your-bids" className="bg-white/3 border border-white/8 rounded-2xl p-6 scroll-mt-6">
              <h3 className="text-white font-semibold mb-4">Your bids</h3>
              {myBids.length === 0 ? (
                <p className="text-white/30 text-sm">You haven't submitted any bids yet.</p>
              ) : (
                <div className="space-y-3">
                  {myBids.map((bid) => {
                    const hasPendingSchedule = bid.jobs?.proposed_date && !bid.jobs?.schedule_confirmed
                    const scheduleConfirmed = bid.jobs?.status === 'scheduled' && bid.jobs?.schedule_confirmed
                    return (
                      <Link
                        key={bid.id}
                        href={`/contractor/jobs/${bid.job_id}`}
                        className="block border-b border-white/5 last:border-0 pb-3 last:pb-0 hover:opacity-80 transition"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-white font-medium text-sm">{bid.jobs?.category}</p>
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
                        <p className="text-white/30 text-xs mt-1">
                          {bid.jobs?.units?.properties?.address}, {bid.jobs?.units?.properties?.city} · Unit {bid.jobs?.units?.unit_number}
                        </p>
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
                            🕐 New time proposed{bid.jobs?.proposed_by !== 'contractor' ? ' — awaiting your response' : ''}
                          </p>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}