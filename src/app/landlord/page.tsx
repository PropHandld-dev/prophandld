'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { AlertsList, type AlertItem } from '@/components/AlertsList'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { EnableNotificationsCard } from '@/components/EnableNotificationsCard'
import { MagneticLink } from '@/components/MagneticLink'
import { CountUp } from '@/components/CountUp'
import {
  BuildingIcon, WrenchIcon, CalendarIcon, ClipboardListIcon,
  DollarSignIcon, FileTextIcon, AlertTriangleIcon, CheckCircleIcon, UserIcon,
} from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ProductTour, type TourStep } from '@/components/ProductTour'
import { useTourVisibility } from '@/lib/useTourVisibility'

const TOUR_STEPS: TourStep[] = [
  { target: '[data-tour="welcome"]', title: 'Welcome to your Landlord Dashboard', body: "Everything about your properties, tenants, and maintenance lives here. Let's take a quick look around." },
  { target: '[data-tour="stats"]', title: 'Your portfolio at a glance', body: 'Property count, units, occupancy, and your monthly rent roll, updated live as things change.' },
  { target: '[data-tour="pipeline"]', title: 'What needs you', body: 'Jobs waiting on your approval, currently in progress, and bids ready for you to review: the three things worth checking daily.' },
  { target: '[data-tour="properties"]', title: 'Your properties', body: 'Add a property to get started, or open one to manage units and tenants.' },
  { target: '[data-tour="quicklinks"]', title: 'Rent, documents & compliance', body: 'Rent collection, your document vault (leases, deeds, inspections), and compliance tracking (licenses, certs, detectors) all live inside each property. Open one to get to them.' },
  { target: '[aria-label="Messages"]', title: 'Message anyone, anytime', body: "Tap here to message an active tenant or a contractor you've worked with before. No open job required." },
  { target: '[data-tour="bottomtabs"]', title: "You're all set", body: 'Home, Properties, Jobs, Calendar, and your Profile are always one tap away down here.' },
]

export default function LandlordDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [now] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const tour = useTourVisibility(user?.id ?? null)
  const [stats, setStats] = useState({
    properties: 0,
    totalUnits: 0,
    occupiedUnits: 0,
    vacantUnits: 0,
    monthlyRentRoll: 0,
    needsApproval: 0,
    inProgress: 0,
    pendingBids: 0,
  })
  const [properties, setProperties] = useState<any[]>([])
  const [newIssues, setNewIssues] = useState<any[]>([])
  const [readyToBid, setReadyToBid] = useState<any[]>([])
  const [priceChangeRequests, setPriceChangeRequests] = useState<any[]>([])
  const [needsReview, setNeedsReview] = useState<any[]>([])
  const [scheduleProposals, setScheduleProposals] = useState<any[]>([])
  const [confirmedSchedules, setConfirmedSchedules] = useState<any[]>([])
  const [pendingReviewJobs, setPendingReviewJobs] = useState<any[]>([])
  const [needsRating, setNeedsRating] = useState<any[]>([])
  const [pendingInvites, setPendingInvites] = useState<any[]>([])
  const [complianceAlerts, setComplianceAlerts] = useState<any[]>([])
  const [rentAlerts, setRentAlerts] = useState<any[]>([])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUser(user)

      const { data: propertiesData } = await supabase
        .from('properties')
        .select('*')
        .eq('owner_user_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: false })

      const propertyList = propertiesData || []

      if (propertyList.length === 0) {
        setLoading(false)
        return
      }

      const propertyIds = propertyList.map((p) => p.id)

      // The dashboard used to run 20+ queries one after another, each waiting
      // on the last. Almost none depend on each other, so they run together
      // in rounds — only what genuinely needs an earlier result waits for it.
      const [{ data: complianceItemsData }, { data: unitsData }] = await Promise.all([
        supabase
          .from('compliance_items')
          .select('*, properties(address, city)')
          .in('property_id', propertyIds)
          .not('expiry_date', 'is', null),
        supabase.from('units').select('*').in('property_id', propertyIds),
      ])

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const complianceAlertsList = (complianceItemsData || []).filter((item) => {
        const expiry = new Date(item.expiry_date + 'T00:00:00')
        const daysUntil = Math.round((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
        const reminderDays = item.reminder_days ?? 30
        return daysUntil <= reminderDays
      })

      const unitList = unitsData || []
      const unitIds = unitList.map((u) => u.id)
      const none = Promise.resolve({ data: [] as any[] })
      const jobSelect = '*, units(unit_number, properties(address, city))'

      // One query for every job that's still live (previously nine separate
      // queries against the same table, one per status), and a capped one
      // for recently finished jobs (only used for "rate this contractor").
      const [tenanciesRes, openJobsRes, completedRes, invitesRes] = await Promise.all([
        unitIds.length > 0
          ? supabase.from('tenancies').select('id, unit_id, rent_amount').in('unit_id', unitIds).eq('ended', false)
          : none,
        unitIds.length > 0
          ? supabase
              .from('jobs')
              .select(jobSelect)
              .in('unit_id', unitIds)
              .not('status', 'in', '(completed,archived,declined)')
              .order('created_at', { ascending: false })
          : none,
        unitIds.length > 0
          ? supabase
              .from('jobs')
              .select(jobSelect)
              .in('unit_id', unitIds)
              .in('status', ['completed', 'archived'])
              .order('created_at', { ascending: false })
              .limit(100)
          : none,
        unitIds.length > 0
          ? supabase
              .from('tenancy_invites')
              .select('*, units(unit_number, property_id, properties(address, city))')
              .in('unit_id', unitIds)
              .eq('status', 'pending')
          : none,
      ])

      const tenancyList: any[] = tenanciesRes.data || []
      const openJobs: any[] = openJobsRes.data || []
      const completedJobs: any[] = completedRes.data || []
      const pendingInvitesList: any[] = invitesRes.data || []

      const occupiedUnitIds = new Set(tenancyList.map((t) => t.unit_id))
      const monthlyRentRoll = tenancyList.reduce((sum, t) => sum + (t.rent_amount || 0), 0)

      const thisMonthStart = new Date()
      thisMonthStart.setDate(1)
      thisMonthStart.setHours(0, 0, 0, 0)
      // Only the last year is scanned for overdue rent, so this stays a
      // fixed size instead of growing with every month the tenancy exists.
      const rentWindowStart = new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth() - 12, 1)
      const rentWindowKey = `${rentWindowStart.getFullYear()}-${String(rentWindowStart.getMonth() + 1).padStart(2, '0')}-01`

      const tenancyIds = tenancyList.map((t) => t.id)
      const openJobIds = openJobs.map((j) => j.id)

      const [rentRes, bidsRes, reviewsRes] = await Promise.all([
        tenancyIds.length > 0
          ? supabase
              .from('rent_payments')
              .select('id, tenancy_id, month, expected_amount, actual_amount')
              .in('tenancy_id', tenancyIds)
              .gte('month', rentWindowKey)
          : none,
        openJobIds.length > 0
          ? supabase
              .from('bids')
              .select('job_id, contractor_user_id, status, price_change_status')
              .in('job_id', openJobIds)
          : none,
        completedJobs.length > 0
          ? supabase
              .from('contractor_reviews')
              .select('job_id')
              .eq('reviewer_user_id', user.id)
              .in('job_id', completedJobs.map((j) => j.id))
          : none,
      ])

      const rentAlertsList = ((rentRes.data as any[]) || [])
        .filter((rp) => {
          const monthDate = new Date(rp.month + 'T00:00:00')
          const actual = rp.actual_amount || 0
          return monthDate <= thisMonthStart && actual < (rp.expected_amount || 0)
        })
        .map((rp) => {
          const tenancyForPayment = tenancyList.find((t) => t.id === rp.tenancy_id)
          const unitForPayment = unitList.find((u) => u.id === tenancyForPayment?.unit_id)
          const propertyForPayment = propertyList.find((p) => p.id === unitForPayment?.property_id)
          return { ...rp, unit: unitForPayment, property: propertyForPayment }
        })

      // Everything below is sorting the jobs already loaded, no more queries.
      const bids: any[] = (bidsRes.data as any[]) || []
      const byStatus = (...statuses: string[]) => openJobs.filter((j) => statuses.includes(j.status))

      const needsApprovalCount = byStatus('pending_approval', 'approved').length
      const inProgressCount = byStatus('approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress', 'pending_review').length
      const newIssuesList = byStatus('pending_approval')
      const readyToBidList = byStatus('approved')

      const priceChangeJobIds = new Set(
        bids.filter((b) => b.status === 'accepted' && b.price_change_status === 'pending').map((b) => b.job_id)
      )
      const priceChangeRequestsList = byStatus('bid_selected', 'scheduled', 'in_progress').filter((j) => priceChangeJobIds.has(j.id))

      const scheduleProposalsList = openJobs.filter(
        (j) => j.proposed_date && j.schedule_confirmed === false && j.proposed_by && j.proposed_by !== 'landlord'
      )
      const confirmedSchedulesList = openJobs.filter((j) => j.status === 'scheduled' && j.schedule_confirmed === true)
      const pendingReviewList = byStatus('pending_review')

      const reviewedJobIds = new Set(((reviewsRes.data as any[]) || []).map((r) => r.job_id))
      const needsRatingList = completedJobs.filter((j) => !reviewedJobIds.has(j.id))

      // Only bids still open count, so a job reopened after a contractor
      // cancelled doesn't show its old declined bids as "N bids".
      const openBidCounts = new Map<string, number>()
      bids.filter((b) => b.status === 'pending').forEach((b) => {
        openBidCounts.set(b.job_id, (openBidCounts.get(b.job_id) || 0) + 1)
      })
      const biddingJobsWithBids = byStatus('bidding')
        .map((job) => ({ ...job, bidCount: openBidCounts.get(job.id) || 0 }))
        .filter((job) => job.bidCount > 0)

      // Names for the "work complete" banners: one lookup per contractor.
      const acceptedByJob = new Map<string, string>()
      bids.filter((b) => b.status === 'accepted').forEach((b) => acceptedByJob.set(b.job_id, b.contractor_user_id))
      const contractorIds = Array.from(new Set(pendingReviewList.map((j) => acceptedByJob.get(j.id)).filter(Boolean))) as string[]
      const nameEntries = await Promise.all(
        contractorIds.map(async (id) => {
          const { data } = await supabase.rpc('get_user_by_id', { user_id_input: id }).maybeSingle()
          return [id, (data as any)?.full_name || 'Contractor'] as const
        })
      )
      const contractorNames = new Map(nameEntries)
      const enrichedReviewJobs = pendingReviewList.map((job) => ({
        ...job,
        contractorName: contractorNames.get(acceptedByJob.get(job.id) || '') || 'Contractor',
      }))

      const propertyBreakdown = propertyList.map((property) => {
        const propertyUnits = unitList.filter((u) => u.property_id === property.id)
        const propertyOccupied = propertyUnits.filter((u) => occupiedUnitIds.has(u.id)).length
        return {
          ...property,
          totalUnits: propertyUnits.length,
          occupiedUnits: propertyOccupied,
        }
      })

      setStats({
        properties: propertyList.length,
        totalUnits: unitList.length,
        occupiedUnits: occupiedUnitIds.size,
        vacantUnits: unitList.length - occupiedUnitIds.size,
        monthlyRentRoll,
        needsApproval: needsApprovalCount,
        inProgress: inProgressCount,
        pendingBids: biddingJobsWithBids.length,
      })
      setProperties(propertyBreakdown)
      setNewIssues(newIssuesList)
      setReadyToBid(readyToBidList)
      setPriceChangeRequests(priceChangeRequestsList)
      setComplianceAlerts(complianceAlertsList)
      setRentAlerts(rentAlertsList)
      setNeedsReview(biddingJobsWithBids)
      setScheduleProposals(scheduleProposalsList)
      setConfirmedSchedules(confirmedSchedulesList)
      setPendingReviewJobs(enrichedReviewJobs)
      setNeedsRating(needsRatingList)
      setPendingInvites(pendingInvitesList)
      setLoading(false)
    }
    getUser()
  }, [router])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)

  const occupancyRate = stats.totalUnits > 0
    ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
    : 0

  const alertItems: AlertItem[] = [
    ...newIssues.map((job) => ({
      id: `new-${job.id}`,
      icon: AlertTriangleIcon,
      tone: 'red' as const,
      title: job.category,
      subtitle: `${job.units?.properties?.address}, ${job.units?.properties?.city} · Unit ${job.units?.unit_number}`,
      href: `/landlord/jobs/${job.id}`,
      badge: 'New',
    })),
    ...readyToBid.map((job) => ({
      id: `bid-ready-${job.id}`,
      icon: WrenchIcon,
      tone: 'yellow' as const,
      title: job.category,
      subtitle: `${job.units?.properties?.address}, ${job.units?.properties?.city} · Unit ${job.units?.unit_number}`,
      href: `/landlord/jobs/${job.id}`,
      badge: 'Start bidding',
    })),
    ...priceChangeRequests.map((job) => ({
      id: `price-${job.id}`,
      icon: DollarSignIcon,
      tone: 'yellow' as const,
      title: job.category,
      subtitle: `${job.units?.properties?.address}, ${job.units?.properties?.city} · Unit ${job.units?.unit_number}`,
      href: `/landlord/jobs/${job.id}`,
      badge: 'Price change',
    })),
    ...scheduleProposals.map((job) => ({
      id: `sched-${job.id}`,
      icon: CalendarIcon,
      tone: 'yellow' as const,
      title: job.category,
      subtitle: `${job.units?.properties?.address} · New time from ${job.proposed_by}`,
      href: `/landlord/jobs/${job.id}`,
      badge: 'Review time',
    })),
    ...confirmedSchedules.map((job) => ({
      id: `confirmed-${job.id}`,
      icon: CheckCircleIcon,
      tone: 'teal' as const,
      title: job.category,
      subtitle: `${job.units?.properties?.address}, ${job.units?.properties?.city}`,
      href: `/landlord/jobs/${job.id}`,
      badge: 'Confirmed',
    })),
    ...pendingReviewJobs.map((job) => ({
      id: `pending-review-${job.id}`,
      icon: CheckCircleIcon,
      tone: 'teal' as const,
      title: `${job.category} · Unit ${job.units?.unit_number}`,
      subtitle: `${job.units?.properties?.address}: ${job.contractorName} notified work complete`,
      href: `/landlord/jobs/${job.id}`,
      badge: 'Review',
    })),
    ...complianceAlerts.map((item) => {
      const expiry = new Date(item.expiry_date + 'T00:00:00')
      const isExpired = expiry.getTime() < now
      return {
        id: `compliance-${item.id}`,
        icon: AlertTriangleIcon,
        tone: 'red' as const,
        title: item.item_type,
        subtitle: `${item.properties?.address}, ${item.properties?.city}`,
        href: `/landlord/properties/${item.property_id}/compliance`,
        badge: isExpired ? 'Expired' : 'Expiring soon',
      }
    }),
    ...rentAlerts.map((rp) => ({
      id: `rent-${rp.id}`,
      icon: DollarSignIcon,
      tone: 'red' as const,
      title: `${rp.property?.address} · Unit ${rp.unit?.unit_number}`,
      subtitle: `${new Date(rp.month + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · $${rp.actual_amount || 0} of $${rp.expected_amount}`,
      href: `/landlord/properties/${rp.property?.id}/units/${rp.unit?.id}/rent`,
      badge: 'Behind',
    })),
    ...needsReview.map((job) => ({
      id: `bids-${job.id}`,
      icon: ClipboardListIcon,
      tone: 'yellow' as const,
      title: job.category,
      subtitle: `${job.units?.properties?.address}, ${job.units?.properties?.city} · Unit ${job.units?.unit_number}`,
      href: `/landlord/jobs/${job.id}`,
      badge: `${job.bidCount} bid${job.bidCount > 1 ? 's' : ''}`,
    })),
    ...needsRating.map((job) => ({
      id: `rate-${job.id}`,
      icon: CheckCircleIcon,
      tone: 'teal' as const,
      title: job.category,
      subtitle: `${job.units?.properties?.address}, ${job.units?.properties?.city} · Unit ${job.units?.unit_number}`,
      href: `/landlord/jobs/${job.id}`,
      badge: 'Rate contractor',
    })),
    ...pendingInvites.map((invite) => ({
      id: `invite-${invite.id}`,
      icon: UserIcon,
      tone: 'teal' as const,
      title: invite.renter_email,
      subtitle: `${invite.units?.properties?.address}, ${invite.units?.properties?.city} · Unit ${invite.units?.unit_number}`,
      href: `/landlord/properties/${invite.units?.property_id ?? ''}/units/${invite.unit_id}`,
      badge: 'Invite pending',
    })),
  ]

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between backdrop-blur-sm sticky top-0 bg-[#0C1A2E]/90 z-10">
        <div className="flex items-center gap-3">
          <svg width="30" height="30" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,5 38,16 38,28 62,28 62,16" fill="white" opacity="0.95"/>
            <rect x="44" y="18" width="12" height="10" rx="0.5" fill="#0C1A2E"/>
            <line x1="38" y1="20" x2="18" y2="42" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="62" y1="20" x2="82" y2="42" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="13" cy="48" r="11" fill="white"/>
            <text x="13" y="53" textAnchor="middle" fill="#0C1A2E" fontSize="11" fontFamily="Inter,sans-serif" fontWeight="800">$</text>
            <circle cx="84" cy="46" r="9" fill="none" stroke="white" strokeWidth="3"/>
            <circle cx="83.5" cy="45.5" r="5" fill="none" stroke="white" strokeWidth="2.5"/>
            <line x1="87" y1="49.5" x2="92" y2="55" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="50" cy="44" r="8" fill="white"/>
            <path d="M34 56 Q42 51 50 51 Q58 51 66 56 L68 78 H32 Z" fill="white"/>
            <polygon points="50,53 48,60 50,62 52,60" fill="#0A7B7E"/>
            <path d="M36 59 Q26 54 20 50" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none"/>
            <path d="M64 59 Q74 54 80 50" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none"/>
            <rect x="38" y="78" width="9" height="18" rx="4" fill="white"/>
            <rect x="53" y="78" width="9" height="18" rx="4" fill="white"/>
          </svg>
          <Link href="/landlord" className="text-white font-semibold text-lg tracking-tight hover:opacity-80 transition">Prophandld</Link>
          <span className="text-xs bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 rounded-full px-2.5 py-1">
            Landlord
          </span>
        </div>
        <span className="text-white/50 text-sm hidden sm:block">{user?.user_metadata?.full_name}</span>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10 pb-28">

        {loading ? (
          <div className="space-y-6">
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <div className="mb-8" data-tour="welcome">
              <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-wide mb-1.5">Landlord Dashboard</p>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                Welcome back,{' '}
                <Link href="/profile" className="hover:text-[#12A5A9] transition">
                  {user?.user_metadata?.full_name?.split(' ')[0]}
                </Link>
              </h1>
              <p className="text-white/50 mt-2">Here&apos;s the state of your portfolio right now.</p>
            </div>

            <AlertsList items={alertItems} />
            <EnableNotificationsCard />

            <ScrollReveal className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-tour="stats">
              <Link
                href="/landlord/properties"
                className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <BuildingIcon className="w-5 h-5 text-[#12A5A9]" />
                  <span className="text-white/20 group-hover:text-[#12A5A9]/60 transition text-sm">→</span>
                </div>
                <CountUp value={stats.properties} className="text-3xl font-bold text-white block" />
                <div className="text-white/60 text-sm mt-1">Properties</div>
              </Link>

              <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <BuildingIcon className="w-5 h-5 text-white/60" />
                </div>
                <CountUp value={stats.totalUnits} className="text-3xl font-bold text-white block" />
                <div className="text-white/60 text-sm mt-1">Total units</div>
              </div>

              <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <CheckCircleIcon className="w-5 h-5 text-[#12A5A9]" />
                  <span className="text-[#12A5A9] text-xs font-semibold">{occupancyRate}%</span>
                </div>
                <CountUp value={stats.occupiedUnits} className="text-3xl font-bold text-white block" />
                <div className="text-white/60 text-sm mt-1">Occupied · {stats.vacantUnits} vacant</div>
              </div>

              <div className="bg-gradient-to-br from-[#0A7B7E]/15 to-[#12A5A9]/5 border border-[#12A5A9]/20 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <DollarSignIcon className="w-5 h-5 text-[#12A5A9]" />
                </div>
                <div className="text-3xl font-bold text-white">{formatCurrency(stats.monthlyRentRoll)}</div>
                <div className="text-white/60 text-sm mt-1">Monthly rent roll</div>
              </div>
            </ScrollReveal>

            <div className="grid grid-cols-3 gap-4 mb-10" data-tour="pipeline">
              <Link href="/landlord/jobs?filter=needs_approval" className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all">
                <ClipboardListIcon className="w-6 h-6 text-white/50 shrink-0" />
                <div>
                  <div className="text-xl font-bold text-white">{stats.needsApproval}</div>
                  <div className="text-white/60 text-xs">Needs action</div>
                </div>
              </Link>
              <Link href="/landlord/jobs?filter=in_progress" className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all">
                <WrenchIcon className="w-6 h-6 text-white/50 shrink-0" />
                <div>
                  <div className="text-xl font-bold text-white">{stats.inProgress}</div>
                  <div className="text-white/60 text-xs">In progress</div>
                </div>
              </Link>
              <Link
                href={needsReview.length > 0 ? `/landlord/jobs/${needsReview[0].id}` : '/landlord/jobs'}
                className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-4 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all"
              >
                <ClipboardListIcon className="w-6 h-6 text-white/50 shrink-0" />
                <div>
                  <div className="text-xl font-bold text-white">{stats.pendingBids}</div>
                  <div className="text-white/60 text-xs">Bids to review</div>
                </div>
              </Link>
            </div>

            <div className="flex items-center justify-between mb-4" data-tour="properties">
              <h2 className="text-white font-semibold text-lg">Your properties</h2>
              <Link href="/landlord/properties" className="text-[#12A5A9] text-sm hover:underline">
                View all
              </Link>
            </div>

            {properties.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-10 text-center mb-10">
                <BuildingIcon className="w-10 h-10 text-white/50 mx-auto mb-3" />
                <h3 className="text-white font-semibold mb-1">No properties yet</h3>
                <p className="text-white/60 text-sm mb-5">Add your first property to start building your portfolio.</p>
                <MagneticLink
                  href="/landlord/properties/new"
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition inline-block"
                >
                  Add property
                </MagneticLink>
              </div>
            ) : (
              <ScrollReveal className="grid gap-3 mb-10">
                {properties.map((property) => {
                  const rate = property.totalUnits > 0
                    ? Math.round((property.occupiedUnits / property.totalUnits) * 100)
                    : 0
                  return (
                    <Link
                      key={property.id}
                      href={`/landlord/properties/${property.id}`}
                      className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-semibold truncate">{property.address}</h3>
                          <p className="text-white/60 text-sm mt-0.5">{property.city}, {property.state}</p>
                        </div>
                        <div className="flex items-center gap-6 shrink-0">
                          <div className="text-right">
                            <div className="text-white text-sm font-medium">
                              {property.occupiedUnits}/{property.totalUnits} occupied
                            </div>
                            <div className="w-24 h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] rounded-full transition-all"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-white/20 text-lg">→</span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </ScrollReveal>
            )}

            <h2 className="text-white font-semibold text-lg mb-4">Quick actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-tour="quicklinks">
              <Link href="/landlord/properties" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                <BuildingIcon className="w-5 h-5 text-[#12A5A9] mb-2" />
                <h3 className="text-white font-semibold mb-1">Properties</h3>
                <p className="text-white/60 text-sm">Manage your properties and units</p>
              </Link>
              <Link href="/landlord/properties/new" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                <BuildingIcon className="w-5 h-5 text-[#12A5A9] mb-2" />
                <h3 className="text-white font-semibold mb-1">Add a property</h3>
                <p className="text-white/60 text-sm">Start tracking a new address</p>
              </Link>
              <Link href="/landlord/jobs" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                <WrenchIcon className="w-5 h-5 text-[#12A5A9] mb-2" />
                <h3 className="text-white font-semibold mb-1">View jobs</h3>
                <p className="text-white/60 text-sm">See all maintenance requests</p>
              </Link>
              <Link href="/landlord/properties" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                <DollarSignIcon className="w-5 h-5 text-[#12A5A9] mb-2" />
                <h3 className="text-white font-semibold mb-1">Rent collection</h3>
                <p className="text-white/60 text-sm">Open a unit to track and collect rent</p>
              </Link>
              <Link href="/landlord/properties" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                <FileTextIcon className="w-5 h-5 text-[#12A5A9] mb-2" />
                <h3 className="text-white font-semibold mb-1">Documents</h3>
                <p className="text-white/60 text-sm">Open a property to upload and manage its documents</p>
              </Link>
              <Link href="/landlord/properties" className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all block">
                <ClipboardListIcon className="w-5 h-5 text-[#12A5A9] mb-2" />
                <h3 className="text-white font-semibold mb-1">Compliance tracking</h3>
                <p className="text-white/60 text-sm">Open a property to manage compliance items</p>
              </Link>
            </div>
          </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
      {tour.show && <ProductTour steps={TOUR_STEPS} onDone={tour.dismiss} onNeverAskAgain={tour.dismissForever} />}
    </div>
  )
}
