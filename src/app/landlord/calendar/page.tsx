'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ScheduleCalendar, eventState, CALENDAR_JOB_STATUSES, calendarHistoryStart, type CalendarEvent } from '@/components/ScheduleCalendar'
import { ScrollReveal } from '@/components/ScrollReveal'

const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Not a job at all — everything else worth a landlord seeing on a
// calendar: a compliance item (fire extinguisher, inspection, permit)
// coming up on or past its expiry, a month of rent still unpaid past its
// due date, and a lease coming up for renewal. All three already exist as
// real data elsewhere in the app (compliance tracking, rent tracking,
// tenancy details) — this only surfaces them on the same calendar as
// scheduled jobs, rather than building a second, separate reminder system.
async function loadReminders(propertyIds: string[], unitIds: string[]): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = []
  const today = new Date()
  const windowEnd = new Date()
  windowEnd.setDate(windowEnd.getDate() + 180) // shows up to 6 months out, plus anything already overdue

  const [complianceRes, rentRes, tenanciesRes] = await Promise.all([
    propertyIds.length
      ? supabase
          .from('compliance_items')
          .select('id, item_type, expiry_date, property_id, properties(address)')
          .in('property_id', propertyIds)
          .not('expiry_date', 'is', null)
          .lte('expiry_date', dateStr(windowEnd))
      : Promise.resolve({ data: [] as any[] }),
    unitIds.length
      ? supabase
          .from('rent_payments')
          .select('id, month, expected_amount, actual_amount, tenancy_id, tenancies(rent_due_day, unit_id, units(unit_number, property_id, properties(address)))')
          .order('month', { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as any[] }),
    unitIds.length
      ? supabase
          .from('tenancies')
          .select('id, lease_end, unit_id, units(unit_number, property_id, properties(address))')
          .in('unit_id', unitIds)
          .eq('ended', false)
          .not('lease_end', 'is', null)
          .lte('lease_end', dateStr(windowEnd))
      : Promise.resolve({ data: [] as any[] }),
  ])

  for (const item of complianceRes.data || []) {
    const property = item.properties as any
    events.push({
      id: `compliance-${item.id}`,
      date: item.expiry_date,
      title: `${item.item_type} expires`,
      subtitle: property?.address,
      href: `/landlord/properties/${item.property_id}/compliance`,
      state: 'reminder',
    })
  }

  for (const payment of rentRes.data || []) {
    const tenancy = payment.tenancies as any
    const unit = tenancy?.units as any
    if (!tenancy || !unit || !unitIds.includes(tenancy.unit_id)) continue
    const isPaid = Number(payment.actual_amount || 0) >= Number(payment.expected_amount || 0)
    if (isPaid) continue
    const [year, month] = String(payment.month).split('-').map(Number)
    if (!year || !month) continue
    const due = new Date(year, month - 1, tenancy.rent_due_day || 1)
    if (due > windowEnd) continue // don't show months not due for a long time yet
    events.push({
      id: `rent-${payment.id}`,
      date: dateStr(due),
      title: due < today ? 'Rent overdue' : 'Rent due',
      subtitle: [unit.properties?.address, unit.unit_number].filter(Boolean).join(' · '),
      href: `/landlord/properties/${unit.property_id}/units/${tenancy.unit_id}/rent`,
      state: 'reminder',
    })
  }

  for (const tenancy of tenanciesRes.data || []) {
    const unit = tenancy.units as any
    events.push({
      id: `lease-${tenancy.id}`,
      date: tenancy.lease_end,
      title: 'Lease ends',
      subtitle: [unit?.properties?.address, unit?.unit_number].filter(Boolean).join(' · '),
      href: `/landlord/properties/${unit?.property_id}/units/${tenancy.unit_id}`,
      state: 'reminder',
    })
  }

  return events
}

export default function LandlordCalendarPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: propertiesData } = await supabase
        .from('properties')
        .select('id')
        .eq('owner_user_id', user.id)
        .eq('archived', false)

      const propertyIds = (propertiesData || []).map((p) => p.id)
      if (propertyIds.length === 0) {
        setLoading(false)
        return
      }

      const { data: unitsData } = await supabase
        .from('units')
        .select('id')
        .in('property_id', propertyIds)

      const unitIds = (unitsData || []).map((u) => u.id)
      if (unitIds.length === 0) {
        setLoading(false)
        return
      }

      // Confirmed times, times still waiting for confirmation (which is also
      // what a reschedule looks like until it is accepted), and finished jobs
      // from the last year as a history.
      const { data: confirmedJobs } = await supabase
        .from('jobs')
        .select('*, units(unit_number, properties(address, city))')
        .in('unit_id', unitIds)
        .in('status', CALENDAR_JOB_STATUSES)
        .not('proposed_date', 'is', null)
        .gte('proposed_date', calendarHistoryStart())

      const jobEvents: CalendarEvent[] = (confirmedJobs || [])
        .filter((job) => job.proposed_date)
        .map((job) => ({
          id: job.id,
          date: job.proposed_date,
          window: job.proposed_window,
          title: job.category,
          subtitle: [job.units?.properties?.address, job.units?.unit_number].filter(Boolean).join(' · '),
          href: `/landlord/jobs/${job.id}`,
          state: eventState(job.status, job.schedule_confirmed === true),
        }))

      const reminderEvents = await loadReminders(propertyIds, unitIds)

      setEvents([...jobEvents, ...reminderEvents])
      setLoading(false)
    }
    init()
  }, [router])

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
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-white/50 text-sm mt-1">Confirmed times, times waiting for a reply, finished jobs, and reminders — rent due, compliance items expiring, leases ending — across your portfolio.</p>
        </div>

        <ScrollReveal>
          <ScheduleCalendar events={events} />
        </ScrollReveal>
      </main>
    </div>
  )
}
