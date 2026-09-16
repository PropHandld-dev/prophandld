'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { AlertsList, type AlertItem } from '@/components/AlertsList'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { MagneticLink } from '@/components/MagneticLink'
import { CalendarIcon, DollarSignIcon, CheckCircleIcon, FileTextIcon, MessageCircleIcon } from '@/components/icons'
import { RENTER_TABS } from '@/lib/navTabs'
import { EnableNotificationsCard } from '@/components/EnableNotificationsCard'
import { UnreadDot } from '@/components/UnreadDot'
import { getUnreadJobIds } from '@/lib/messageReads'

export default function RenterDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unit, setUnit] = useState<any>(null)
  const [property, setProperty] = useState<any>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [jobs, setJobs] = useState<any[]>([])
  const [unreadJobIds, setUnreadJobIds] = useState<Set<string>>(new Set())
  const [pickTimeAlerts, setPickTimeAlerts] = useState<any[]>([])
  const [scheduleAlerts, setScheduleAlerts] = useState<any[]>([])
  const [needsRating, setNeedsRating] = useState<any[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUser(user)
      setLoading(false)

      const { data: tenancyData, error: tenancyError } = await supabase
        .from('tenancies')
        .select('*')
        .eq('renter_user_id', user.id)
        .eq('ended', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (tenancyError || !tenancyData) {
        setContactsLoading(false)
        setJobsLoading(false)
        return
      }

      const { data: unitData } = await supabase
        .from('units')
        .select('*')
        .eq('id', tenancyData.unit_id)
        .maybeSingle()

      if (!unitData) {
        setContactsLoading(false)
        setJobsLoading(false)
        return
      }
      setUnit(unitData)

      const { data: propertyData } = await supabase
        .from('properties')
        .select('*')
        .eq('id', unitData.property_id)
        .maybeSingle()

      if (propertyData) setProperty(propertyData)

      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('property_id', unitData.property_id)
        .or(`unit_id.is.null,unit_id.eq.${unitData.id}`)
        .order('created_at', { ascending: false })

      if (contactsError) {
        console.error('Error loading contacts:', contactsError)
      } else {
        setContacts(contactsData || [])
      }
      setContactsLoading(false)

      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('unit_id', unitData.id)
        .not('status', 'in', '(completed,archived,declined)')
        .order('created_at', { ascending: false })

      if (jobsError) {
        console.error('Error loading jobs:', jobsError)
      } else {
        const jobsList = jobsData || []
        setJobs(jobsList)
        getUnreadJobIds(jobsList.map((j) => j.id), user.id).then(setUnreadJobIds)
        setPickTimeAlerts(
          jobsList.filter((j) => j.schedule_ask_tenant && !j.proposed_date)
        )
        setScheduleAlerts(
          jobsList.filter((j) =>
            j.proposed_date && !j.schedule_confirmed && j.proposed_by !== 'renter'
          )
        )
      }

      const { data: completedJobsData } = await supabase
        .from('jobs')
        .select('*')
        .eq('unit_id', unitData.id)
        .in('status', ['completed', 'archived'])

      if (completedJobsData && completedJobsData.length > 0) {
        const { data: myReviews } = await supabase
          .from('contractor_reviews')
          .select('job_id')
          .eq('reviewer_user_id', user.id)
          .in('job_id', completedJobsData.map((j) => j.id))

        const reviewedJobIds = new Set((myReviews || []).map((r) => r.job_id))
        setNeedsRating(completedJobsData.filter((j) => !reviewedJobIds.has(j.id)))
      }

      setJobsLoading(false)
    }
    getUser()
  }, [router])

 const statusLabel = (job: any) => {
  // A pending proposal takes priority over the underlying status,
  // regardless of whether we're still at bid_selected or already scheduled.
  if (job.proposed_date && !job.schedule_confirmed) {
    const proposer = job.proposed_by === 'renter' ? 'you' : 'the other side'
    return `New time proposed by ${proposer}`
  }
  if (['pending_approval', 'approved', 'bidding', 'bid_selected'].includes(job.status)) {
    return 'Landlord is finding a contractor'
  }
  if (job.status === 'scheduled') {
    return 'Scheduled'
  }
  if (job.status === 'in_progress') {
    return 'Work in progress'
  }
  if (job.status === 'pending_review') {
    return 'Work complete — waiting on landlord'
  }
  return job.status
}

  const alertItems: AlertItem[] = [
    ...pickTimeAlerts.map((job) => ({
      id: `pick-${job.id}`,
      icon: CalendarIcon,
      tone: 'yellow' as const,
      title: job.category,
      subtitle: 'Your landlord wants you to pick a time',
      href: `/renter/jobs/${job.id}`,
      badge: 'Pick a time',
    })),
    ...scheduleAlerts.map((job) => ({
      id: `sched-${job.id}`,
      icon: CalendarIcon,
      tone: 'yellow' as const,
      title: job.category,
      subtitle: 'New time proposed',
      href: `/renter/jobs/${job.id}`,
      badge: 'Review',
    })),
    ...needsRating.map((job) => ({
      id: `rate-${job.id}`,
      icon: CheckCircleIcon,
      tone: 'teal' as const,
      title: job.category,
      subtitle: 'How did the contractor do?',
      href: `/renter/jobs/${job.id}`,
      badge: 'Rate contractor',
    })),
  ]

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold">Prophandld</span>
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5">Renter</span>
        </div>
        <span className="text-white/50 text-sm">{user?.user_metadata?.full_name}</span>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-7 w-40 mb-2" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-24 mt-4" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white">
                Hi, {user?.user_metadata?.full_name?.split(' ')[0]}
              </h1>
              <p className="text-white/50 mt-1">Track your maintenance requests here.</p>
            </div>

            <AlertsList items={alertItems} />
            <EnableNotificationsCard />

            {unit && property && (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
                <h3 className="text-white font-semibold mb-1">Your home</h3>
                <p className="text-white/70 text-sm mt-2">{property.address}</p>
                <p className="text-white/50 text-sm">
                  {property.city}, {property.state} {property.zip} · Unit {unit.unit_number}
                </p>
              </div>
            )}

            {unit && (
              <Link
                href="/renter/documents"
                className="block bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center gap-2">
                  <FileTextIcon className="w-4 h-4 text-white/40" />
                  <h3 className="text-white font-semibold">Documents</h3>
                </div>
                <p className="text-white/40 text-sm mt-1">Your lease and related paperwork</p>
              </Link>
            )}

            {unit && (
              <Link
                href="/renter/rent"
                className="block bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <DollarSignIcon className="w-4 h-4 text-white/40" />
                  <h3 className="text-white font-semibold">Pay rent</h3>
                </div>
                <p className="text-white/40 text-sm mt-1">Secure online rent payments, right from your dashboard — no more checks or cash.</p>
              </Link>
            )}

            <ScrollReveal className="bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-2xl p-6 mb-6">
              <h3 className="text-white font-semibold mb-1">Report an issue</h3>
              <p className="text-white/50 text-sm mb-4">Something broken? Let your landlord know.</p>
              <MagneticLink
                href="/renter/report"
                className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:opacity-90 transition"
              >
                Report now
              </MagneticLink>
            </ScrollReveal>

            <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
              <h3 className="text-white font-semibold mb-4">Your issues</h3>

              {jobsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex items-center gap-2 text-white/30 text-sm">
                  <CheckCircleIcon className="w-4 h-4" />
                  No open issues — you&apos;re all good!
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <Link
                      key={job.id}
                      href={`/renter/jobs/${job.id}`}
                      className="block border-b border-white/5 last:border-0 pb-3 last:pb-0 hover:opacity-80 transition"
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-white font-medium">{job.category}</p>
                        {job.is_emergency && (
                          <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-semibold">
                            Emergency
                          </span>
                        )}
                        {unreadJobIds.has(job.id) && (
                          <span className="inline-flex items-center gap-1 text-[#12A5A9]">
                            <MessageCircleIcon className="w-3.5 h-3.5" />
                            <UnreadDot />
                          </span>
                        )}
                      </div>
                      <p className="text-white/50 text-sm">{job.description}</p>
                      <p className="text-[#12A5A9] text-xs mt-1">{statusLabel(job)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Emergency contacts</h3>

              {contactsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : !unit ? (
                <p className="text-white/30 text-sm">No unit linked to your account yet.</p>
              ) : contacts.length === 0 ? (
                <p className="text-white/30 text-sm">No emergency contacts added for your unit yet.</p>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="border-b border-white/5 last:border-0 pb-3 last:pb-0">
                      <p className="text-white font-medium">{contact.name}</p>
                      {contact.role && <p className="text-white/50 text-sm">{contact.role}</p>}
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="text-[#12A5A9] text-sm hover:underline block mt-1">
                          {contact.phone}
                        </a>
                      )}
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="text-white/40 text-sm hover:underline block">
                          {contact.email}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}
