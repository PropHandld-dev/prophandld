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
import { Logo } from '@/components/Logo'
import { ProfileButton } from '@/components/ProfileButton'
import { MessagesButton } from '@/components/MessagesButton'
import { CalendarIcon, DollarSignIcon, CheckCircleIcon, FileTextIcon, MessageCircleIcon } from '@/components/icons'
import { RENTER_TABS } from '@/lib/navTabs'
import { EnableNotificationsCard } from '@/components/EnableNotificationsCard'
import { UnreadDot } from '@/components/UnreadDot'
import { getUnreadJobIds } from '@/lib/messageReads'
import { ShowMoreList } from '@/components/ShowMoreList'
import { ProductTour, type TourStep } from '@/components/ProductTour'
import { useTourVisibility } from '@/lib/useTourVisibility'
import { useLanguage, t } from '@/lib/i18n'

const TOUR_STEPS: TourStep[] = [
  { target: '[data-tour="welcome"]', title: 'Welcome to your Renter Dashboard', body: "This is where you'll report issues, message your landlord, and pay rent. Quick look around?" },
  { target: '[data-tour="report"]', title: 'Something broken?', body: 'A category, a photo, a short description. Your landlord is notified right away.' },
  { target: '[data-tour="issues"]', title: 'Your issues', body: 'See the status of everything you\'ve reported, at a glance.' },
  { target: '[data-tour="documents"]', title: 'Your documents', body: 'Your lease and any other paperwork your landlord has shared, all in one place.' },
  { target: '[data-tour="messages"]', title: 'Message your landlord anytime', body: "No need to wait for an open issue. Reach out directly whenever you need to." },
  { target: '[data-tour="bottomtabs"]', title: "You're all set", body: 'Home, Report, Calendar, and your Profile are always one tap away down here.' },
]

export default function RenterDashboard() {
  const router = useRouter()
  const lang = useLanguage()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const tour = useTourVisibility(user?.id ?? null)
  const [unit, setUnit] = useState<any>(null)
  const [property, setProperty] = useState<any>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [landlordBackupContacts, setLandlordBackupContacts] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [unreadJobIds, setUnreadJobIds] = useState<Set<string>>(new Set())
  const [pickTimeAlerts, setPickTimeAlerts] = useState<any[]>([])
  const [scheduleAlerts, setScheduleAlerts] = useState<any[]>([])
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

      // Resolves to the caller's tenancy whether they're the primary
      // tenant or a co-renter added on the unit (tenancy_occupants) —
      // both land on the same household lease.
      const { data: tenancyId } = await supabase.rpc('get_my_active_tenancy_id')
      const { data: tenancyData, error: tenancyError } = tenancyId
        ? await supabase.from('tenancies').select('*').eq('id', tenancyId).maybeSingle()
        : { data: null, error: null }

      if (tenancyError || !tenancyData) {
        setContactsLoading(false)
        setJobsLoading(false)
        return
      }

      // The unit (with its property) and this unit's open jobs only need the
      // lease we already have, so they load together instead of one at a
      // time; contacts and the landlord's backup contacts then load together.
      const [{ data: unitData }, jobsResult] = await Promise.all([
        supabase.from('units').select('*, properties(*)').eq('id', tenancyData.unit_id).maybeSingle(),
        supabase
          .from('jobs')
          .select('*')
          .eq('unit_id', tenancyData.unit_id)
          .not('status', 'in', '(completed,archived,declined)')
          .order('created_at', { ascending: false }),
      ])

      if (!unitData) {
        setContactsLoading(false)
        setJobsLoading(false)
        return
      }
      const { properties: propertyData, ...unitRow } = unitData as any
      setUnit(unitRow)
      if (propertyData) setProperty(propertyData)

      const { jobsData, jobsError } = { jobsData: jobsResult.data, jobsError: jobsResult.error }
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
      setJobsLoading(false)

      const [contactsResult, backupResult] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('property_id', unitRow.property_id)
          .or(`unit_id.is.null,unit_id.eq.${unitRow.id}`)
          .order('created_at', { ascending: false }),
        propertyData?.owner_user_id
          ? supabase.from('personal_emergency_contacts').select('*').eq('user_id', propertyData.owner_user_id)
          : Promise.resolve({ data: [] as any[] }),
      ])

      if (contactsResult.error) {
        console.error('Error loading contacts:', contactsResult.error)
      } else {
        setContacts(contactsResult.data || [])
      }
      setLandlordBackupContacts(backupResult.data || [])
      setContactsLoading(false)
    }
    getUser()
  }, [router])

 const statusLabel = (job: any) => {
  // A pending proposal takes priority over the underlying status,
  // regardless of whether we're still at bid_selected or already scheduled.
  if (job.proposed_date && !job.schedule_confirmed) {
    return job.proposed_by === 'renter' ? t('newTimeProposedByYou', lang) : t('newTimeProposedByOther', lang)
  }
  if (['pending_approval', 'approved', 'bidding', 'bid_selected'].includes(job.status)) {
    return t('statusLandlordFinding', lang)
  }
  if (job.status === 'scheduled') {
    return t('statusScheduled', lang)
  }
  if (job.status === 'in_progress') {
    return t('statusWorkInProgress', lang)
  }
  if (job.status === 'pending_review') {
    return t('statusWorkCompleteWaiting', lang)
  }
  return job.status
}

  const alertItems: AlertItem[] = [
    ...pickTimeAlerts.map((job) => ({
      id: `pick-${job.id}`,
      icon: CalendarIcon,
      tone: 'yellow' as const,
      title: job.category,
      subtitle: t('pickATimeAlert', lang),
      href: `/renter/jobs/${job.id}`,
      badge: t('badgePickATime', lang),
    })),
    ...scheduleAlerts.map((job) => ({
      id: `sched-${job.id}`,
      icon: CalendarIcon,
      tone: 'yellow' as const,
      title: job.category,
      subtitle: t('newTimeProposedAlert', lang),
      href: `/renter/jobs/${job.id}`,
      badge: t('badgeReview', lang),
    })),
  ]

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/renter" aria-label="Prophandld home" className="flex items-center gap-2 text-white font-semibold transition hover:opacity-80 active:scale-[0.97] motion-reduce:active:scale-100">
            <Logo className="w-[26px] h-[26px]" />
            Prophandld
          </Link>
          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2 py-0.5">Renter</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessagesButton role="renter" userId={user?.id ?? null} />
          <ProfileButton name={user?.user_metadata?.full_name} />
        </div>
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
            <div className="mb-8" data-tour="welcome">
              <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-wide mb-1.5">{t('renterDashboardLabel', lang)}</p>
              <h1 className="text-2xl font-bold text-white">
                {t('hi', lang)}{' '}
                <Link href="/profile" className="hover:text-[#12A5A9] transition">
                  {user?.user_metadata?.full_name?.split(' ')[0]}
                </Link>
              </h1>
              <p className="text-white/50 mt-1">{t('renterDashboardSubtitle', lang)}</p>
            </div>

            <AlertsList items={alertItems} />
            <EnableNotificationsCard />

            {unit && property && (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
                <h3 className="text-white font-semibold mb-1">{t('yourHome', lang)}</h3>
                <p className="text-white/70 text-sm mt-2">{property.address}</p>
                <p className="text-white/50 text-sm">
                  {property.city}, {property.state} {property.zip} · Unit {unit.unit_number}
                </p>
              </div>
            )}

            {unit && (
              <Link
                href="/renter/documents"
                data-tour="documents"
                className="block bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center gap-2">
                  <FileTextIcon className="w-4 h-4 text-white/60" />
                  <h3 className="text-white font-semibold">{t('documentsTitle', lang)}</h3>
                </div>
                <p className="text-white/60 text-sm mt-1">{t('documentsDescRenter', lang)}</p>
              </Link>
            )}

            {unit && (
              <Link
                href="/renter/rent"
                className="block bg-white/3 border border-white/8 rounded-2xl p-6 mb-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <DollarSignIcon className="w-4 h-4 text-white/60" />
                  <h3 className="text-white font-semibold">{t('payRent', lang)}</h3>
                </div>
                <p className="text-white/60 text-sm mt-1">{t('payRentDesc', lang)}</p>
              </Link>
            )}

            <ScrollReveal className="bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/10 border border-[#12A5A9]/30 rounded-2xl p-6 mb-6" data-tour="report">
              <h3 className="text-white font-semibold mb-1">{t('reportTitle', lang)}</h3>
              <p className="text-white/50 text-sm mb-4">{t('reportAnIssueDesc', lang)}</p>
              <MagneticLink
                href="/renter/report"
                className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl text-sm hover:opacity-90 transition"
              >
                {t('reportNow', lang)}
              </MagneticLink>
            </ScrollReveal>

            <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6" data-tour="issues">
              <h3 className="text-white font-semibold mb-4">{t('yourIssues', lang)}</h3>

              {jobsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex items-center gap-2 text-white/50 text-sm">
                  <CheckCircleIcon className="w-4 h-4" />
                  {t('noOpenIssues', lang)}
                </div>
              ) : (
                <div className="space-y-3">
                  <ShowMoreList
                    items={jobs}
                    itemKey={(job) => job.id}
                    renderItem={(job) => (
                      <Link
                        href={`/renter/jobs/${job.id}`}
                        className="block border-b border-white/5 last:border-0 pb-3 last:pb-0 hover:opacity-80 transition"
                      >
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-white font-medium">{job.category}</p>
                          {job.is_emergency && (
                            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-semibold">
                              {t('emergency', lang)}
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
                    )}
                  />
                </div>
              )}
            </div>

            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">{t('emergencyContacts', lang)}</h3>

              {contactsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : !unit ? (
                <p className="text-white/50 text-sm">{t('noUnitLinked', lang)}</p>
              ) : contacts.length === 0 ? (
                <p className="text-white/50 text-sm">{t('noContactsAdded', lang)}</p>
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
                        <a href={`mailto:${contact.email}`} className="text-white/60 text-sm hover:underline block">
                          {contact.email}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {landlordBackupContacts.length > 0 && (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mt-4">
                <h3 className="text-white font-semibold mb-1">{t('ifLandlordDoesntAnswer', lang)}</h3>
                <p className="text-white/40 text-xs mb-4">{t('theirBackupContact', lang)}</p>
                <div className="space-y-3">
                  {landlordBackupContacts.map((c) => (
                    <div key={c.id} className="border-b border-white/5 last:border-0 pb-3 last:pb-0">
                      <p className="text-white font-medium">{c.name}{c.relationship ? ` · ${c.relationship}` : ''}</p>
                      <a href={`tel:${c.phone}`} className="text-[#12A5A9] text-sm hover:underline block mt-1">{c.phone}</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <BottomTabBar tabs={RENTER_TABS} />
      {tour.show && <ProductTour steps={TOUR_STEPS} onDone={tour.dismiss} onNeverAskAgain={tour.dismissForever} />}
    </div>
  )
}
