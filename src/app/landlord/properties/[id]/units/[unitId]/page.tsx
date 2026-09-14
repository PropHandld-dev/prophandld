'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { DollarSignIcon, CalendarIcon, UserIcon, CheckCircleIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { MagneticLink } from '@/components/MagneticLink'
import { RippleButton } from '@/components/RippleButton'

const IN_PROGRESS_STATUSES = ['pending_approval', 'approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress']

export default function UnitDetailPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string
  const [unit, setUnit] = useState<any>(null)
  const [tenancy, setTenancy] = useState<any>(null)
  const [pendingInvite, setPendingInvite] = useState<any>(null)
  const [invitingBusy, setInvitingBusy] = useState(false)
  const [tenantLookupFailed, setTenantLookupFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showMoveOutForm, setShowMoveOutForm] = useState(false)
  const [moveOutDate, setMoveOutDate] = useState('')
  const [savingMoveOut, setSavingMoveOut] = useState(false)
  const [moveOutError, setMoveOutError] = useState<string | null>(null)
  const [moveOutSuccess, setMoveOutSuccess] = useState(false)
  const [openJobs, setOpenJobs] = useState<any[]>([])
  const [jobHistory, setJobHistory] = useState<any[]>([])

  const [editingTenancy, setEditingTenancy] = useState(false)
  const [savingTenancy, setSavingTenancy] = useState(false)
  const [tenancyEditError, setTenancyEditError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    rent_amount: '',
    escalation_percent: '',
    escalation_frequency_months: '',
    occupants: '',
    pets: '',
    lease_notes: '',
  })

  const fetchUnit = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: unitData } = await supabase
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single()

    if (!unitData) {
      router.push(`/landlord/properties/${propertyId}`)
      return
    }

    setUnit(unitData)

    const { data: tenancyData } = await supabase
      .from('tenancies')
      .select('*')
      .eq('unit_id', unitId)
      .eq('ended', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (tenancyData) {
      const { data: renterData, error: renterError } = await supabase
        .rpc('get_user_by_id', { user_id_input: tenancyData.renter_user_id })
        .maybeSingle()

      if (renterError) {
        console.error('Error fetching renter:', renterError)
        setTenantLookupFailed(true)
      }

      setTenancy({ ...tenancyData, users: renterData })
      setPendingInvite(null)
    } else {
      setTenancy(null)

      const { data: inviteData } = await supabase
        .from('tenancy_invites')
        .select('*')
        .eq('unit_id', unitId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setPendingInvite(inviteData || null)
    }

    const { data: jobsData, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false })

    if (jobsError) {
      console.error('Error loading jobs:', jobsError)
    } else if (jobsData) {
      setOpenJobs(jobsData.filter((j) => IN_PROGRESS_STATUSES.includes(j.status)))
      setJobHistory(jobsData.filter((j) => ['completed', 'archived', 'declined'].includes(j.status)))
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchUnit()
  }, [unitId, propertyId, router])

  const handleStartEndTenancy = () => {
    setShowMoveOutForm(true)
    setMoveOutError(null)
  }

  const handleCancelInvite = async () => {
    if (!pendingInvite) return
    if (!window.confirm(`Cancel the invite to ${pendingInvite.renter_email}?`)) return

    setInvitingBusy(true)
    const { error } = await supabase
      .from('tenancy_invites')
      .update({ status: 'cancelled' })
      .eq('id', pendingInvite.id)

    if (error) {
      console.error('Error cancelling invite:', error)
    }

    await fetchUnit()
    setInvitingBusy(false)
  }

  const handleResendInvite = async () => {
    if (!pendingInvite) return
    setInvitingBusy(true)

    fetch('/api/invite-renter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId: pendingInvite.id }),
    }).catch((err) => console.error('invite-renter fetch failed:', err))

    setInvitingBusy(false)
  }

  const handleConfirmMoveOutDate = async () => {
    if (!moveOutDate) {
      setMoveOutError('Please select a move-out date.')
      return
    }

    setSavingMoveOut(true)
    setMoveOutError(null)

    const { error: updateError } = await supabase
      .from('tenancies')
      .update({ move_out_date: moveOutDate })
      .eq('id', tenancy.id)

    if (updateError) {
      console.error('Error setting move-out date:', updateError)
      setMoveOutError('Could not set move-out date.')
      setSavingMoveOut(false)
      return
    }

    const { error: insertError } = await supabase
      .from('move_in_inspections')
      .insert({ tenancy_id: tenancy.id, unit_id: unitId, status: 'in_progress', type: 'move_out' })

    if (insertError) {
      console.error('Error creating move-out inspection:', insertError)
    }

    router.push(`/landlord/properties/${propertyId}/units/${unitId}/inspection?type=move_out`)
  }

  const handleConfirmMoveOutComplete = async () => {
    const confirmed = window.confirm(
      'Confirm this tenant has fully moved out? This will mark the unit as vacant.'
    )
    if (!confirmed) return

    const { error: updateError } = await supabase
      .from('tenancies')
      .update({ ended: true })
      .eq('id', tenancy.id)

    if (updateError) {
      console.error('Error ending tenancy:', updateError)
      setMoveOutError('Could not end tenancy: ' + updateError.message)
      return
    }

    setMoveOutSuccess(true)
    await fetchUnit()
  }

  const openTenancyEdit = () => {
    setEditForm({
      rent_amount: tenancy.rent_amount?.toString() || '',
      escalation_percent: tenancy.escalation_percent?.toString() || '',
      escalation_frequency_months: tenancy.escalation_frequency_months?.toString() || '',
      occupants: tenancy.occupants?.toString() || '',
      pets: tenancy.pets || '',
      lease_notes: tenancy.lease_notes || '',
    })
    setTenancyEditError(null)
    setEditingTenancy(true)
  }

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value })
  }

  const handleSaveTenancy = async () => {
    setSavingTenancy(true)
    setTenancyEditError(null)

    const { error: updateError } = await supabase
      .from('tenancies')
      .update({
        rent_amount: editForm.rent_amount ? parseFloat(editForm.rent_amount) : null,
        escalation_percent: editForm.escalation_percent ? parseFloat(editForm.escalation_percent) : null,
        escalation_frequency_months: editForm.escalation_frequency_months ? parseInt(editForm.escalation_frequency_months) : null,
        occupants: editForm.occupants ? parseInt(editForm.occupants) : null,
        pets: editForm.pets.trim() || null,
        lease_notes: editForm.lease_notes.trim() || null,
      })
      .eq('id', tenancy.id)

    if (updateError) {
      console.error('Error updating tenancy:', updateError)
      setTenancyEditError('Could not save changes.')
      setSavingTenancy(false)
      return
    }

    setEditingTenancy(false)
    setSavingTenancy(false)
    await fetchUnit()
  }

  const nextEscalationDate = (leaseStart: string | null, frequencyMonths: number | null) => {
    if (!leaseStart || !frequencyMonths) return null
    const start = new Date(leaseStart + 'T00:00:00')
    const now = new Date()
    const next = new Date(start)
    while (next <= now) {
      next.setMonth(next.getMonth() + frequencyMonths)
    }
    return next
  }

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending_approval: 'Needs approval',
      approved: 'Acknowledged',
      bidding: 'Getting bids',
      bid_selected: 'Contractor selected',
      scheduled: 'Scheduled',
      in_progress: 'In progress',
      completed: 'Completed',
      archived: 'Archived',
      declined: 'Declined',
    }
    return labels[status] || status
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          ← Property
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">

        {loading || !unit ? (
          <div className="space-y-6">
            <div>
              <Skeleton className="h-7 w-40 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
        <>
        {/* Unit header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{unit.unit_number}</h1>
          {unit.floor && <p className="text-white/50 text-sm mt-1">Floor {unit.floor}</p>}
          {unit.sqft && <p className="text-white/50 text-sm">{unit.sqft} sqft</p>}
        </div>

        {moveOutSuccess && (
          <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
            <p className="text-[#12A5A9] text-sm font-medium">
              Tenancy ended. This unit is now marked vacant.
            </p>
          </div>
        )}

        {/* Tenant section */}
        <ScrollReveal>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Tenant</h2>
            {!tenancy && !pendingInvite && (
              <MagneticLink
                href={`/landlord/properties/${propertyId}/units/${unitId}/tenancy/new`}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition"
              >
                + Link renter
              </MagneticLink>
            )}
            {tenancy && !editingTenancy && (
              <button
                onClick={openTenancyEdit}
                className="text-[#12A5A9] text-xs font-semibold hover:underline"
              >
                Edit
              </button>
            )}
          </div>

          {tenancy && tenantLookupFailed ? (
            <p className="text-yellow-400/70 text-sm">
              Tenant linked, but details are unavailable right now.
            </p>
          ) : tenancy ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0A7B7E]/20 rounded-full flex items-center justify-center text-[#12A5A9] font-semibold">
                  {tenancy.users?.full_name?.[0] || '?'}
                </div>
                <div>
                  <p className="text-white font-medium">{tenancy.users?.full_name}</p>
                  <p className="text-white/50 text-sm">{tenancy.users?.email}</p>
                </div>
              </div>
              {tenancy.users?.phone && (
                <p className="text-white/40 text-sm">📞 {tenancy.users.phone}</p>
              )}
              {tenancy.rent_amount && (
                <p className="text-white/40 text-sm flex items-center gap-1.5">
                  <DollarSignIcon className="w-3.5 h-3.5 text-white/40" />
                  ${tenancy.rent_amount}/month
                </p>
              )}
              {tenancy.lease_start && (
                <p className="text-white/40 text-sm flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-white/40" />
                  {new Date(tenancy.lease_start).toLocaleDateString()}
                  {tenancy.lease_end ? ` → ${new Date(tenancy.lease_end).toLocaleDateString()}` : ' → ongoing'}
                </p>
              )}

              {!editingTenancy && tenancy.escalation_percent && tenancy.escalation_frequency_months && (
                <p className="text-white/40 text-sm">
                  📈 +{tenancy.escalation_percent}% every {tenancy.escalation_frequency_months} months
                  {tenancy.lease_start && (() => {
                    const next = nextEscalationDate(tenancy.lease_start, tenancy.escalation_frequency_months)
                    return next ? ` — next due ${next.toLocaleDateString()}` : ''
                  })()}
                </p>
              )}

              {!editingTenancy && tenancy.occupants && (
                <p className="text-white/40 text-sm flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-white/40" />
                  {tenancy.occupants} occupant{tenancy.occupants === 1 ? '' : 's'}
                </p>
              )}

              {!editingTenancy && tenancy.pets && (
                <p className="text-white/40 text-sm">🐾 {tenancy.pets}</p>
              )}

              {!editingTenancy && tenancy.lease_notes && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-2">
                  <p className="text-white/50 text-sm">{tenancy.lease_notes}</p>
                </div>
              )}

              {editingTenancy && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2 space-y-3">
                  <div>
                    <label className="text-white/70 text-xs block mb-1">Monthly rent ($)</label>
                    <input
                      type="number"
                      name="rent_amount"
                      value={editForm.rent_amount}
                      onChange={handleEditFormChange}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-white/70 text-xs block mb-1">Escalation (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        name="escalation_percent"
                        value={editForm.escalation_percent}
                        onChange={handleEditFormChange}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-xs block mb-1">Every (months)</label>
                      <input
                        type="number"
                        name="escalation_frequency_months"
                        value={editForm.escalation_frequency_months}
                        onChange={handleEditFormChange}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-white/70 text-xs block mb-1">Occupants</label>
                    <input
                      type="number"
                      name="occupants"
                      value={editForm.occupants}
                      onChange={handleEditFormChange}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                    />
                  </div>
                  <div>
                    <label className="text-white/70 text-xs block mb-1">Pets</label>
                    <input
                      type="text"
                      name="pets"
                      value={editForm.pets}
                      onChange={handleEditFormChange}
                      placeholder="e.g. 1 dog (Labrador)"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
                    />
                  </div>
                  <div>
                    <label className="text-white/70 text-xs block mb-1">Lease notes</label>
                    <textarea
                      name="lease_notes"
                      value={editForm.lease_notes}
                      onChange={handleEditFormChange}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition resize-none"
                    />
                  </div>
                  {tenancyEditError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">
                      {tenancyEditError}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <RippleButton
                      onClick={handleSaveTenancy}
                      disabled={savingTenancy}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      {savingTenancy ? 'Saving...' : 'Save'}
                    </RippleButton>
                    <button
                      onClick={() => setEditingTenancy(false)}
                      className="text-white/40 text-xs hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {tenancy.move_out_date && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mt-2">
                  <p className="text-yellow-400/80 text-sm">
                    🚪 Move-out scheduled for {new Date(tenancy.move_out_date).toLocaleDateString()}
                  </p>
                </div>
              )}

              {moveOutError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {moveOutError}
                </div>
              )}

              {showMoveOutForm ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2 space-y-3">
                  <label className="text-white/70 text-sm block">Move-out date</label>
                  <input
                    type="date"
                    value={moveOutDate}
                    onChange={(e) => setMoveOutDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleConfirmMoveOutDate}
                      disabled={savingMoveOut}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      {savingMoveOut ? 'Saving...' : 'Confirm & start move-out inspection'}
                    </button>
                    <button
                      onClick={() => setShowMoveOutForm(false)}
                      className="text-white/40 text-xs hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 mt-2">
                  <Link
                    href={`/landlord/properties/${propertyId}/units/${unitId}/inspection`}
                    className="text-[#12A5A9] text-xs hover:underline"
                  >
                    Move-in inspection
                  </Link>
                  {tenancy.move_out_date && (
                    <Link
                      href={`/landlord/properties/${propertyId}/units/${unitId}/inspection?type=move_out`}
                      className="text-[#12A5A9] text-xs hover:underline"
                    >
                      Move-out inspection
                    </Link>
                  )}
                  {!tenancy.move_out_date ? (
                    <button
                      onClick={handleStartEndTenancy}
                      className="text-red-400/70 text-xs hover:text-red-400 transition"
                    >
                      End tenancy
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirmMoveOutComplete}
                      className="text-red-400/70 text-xs hover:text-red-400 transition"
                    >
                      Confirm move-out complete
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : pendingInvite ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-yellow-400/80 text-sm font-medium">
                Invited: {pendingInvite.renter_email}
              </p>
              <p className="text-white/40 text-xs mt-1">Waiting for them to sign up.</p>
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={handleResendInvite}
                  disabled={invitingBusy}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50"
                >
                  Resend
                </button>
                <button
                  onClick={handleCancelInvite}
                  disabled={invitingBusy}
                  className="text-red-400/70 hover:text-red-400 text-xs transition disabled:opacity-50"
                >
                  Cancel invite
                </button>
              </div>
            </div>
          ) : (
            <p className="text-white/30 text-sm">No tenant linked — unit is vacant.</p>
          )}
        </div>
        </ScrollReveal>

        {/* Rent */}
        {tenancy && (
          <ScrollReveal>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Rent</h2>
              <Link
                href={`/landlord/properties/${propertyId}/units/${unitId}/rent`}
                className="text-[#12A5A9] text-sm hover:underline"
              >
                Manage
              </Link>
            </div>
            <p className="text-white/30 text-sm">Track expected vs. actual rent payments each month.</p>
          </div>
          </ScrollReveal>
        )}

        {/* Open jobs */}
        <ScrollReveal>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Open jobs</h2>
            <Link
              href={`/landlord/properties/${propertyId}/units/${unitId}/jobs/new`}
              className="text-[#12A5A9] text-xs hover:underline"
            >
              + Create job
            </Link>
          </div>
          {openJobs.length === 0 ? (
            <p className="text-white/30 text-sm">No open jobs for this unit.</p>
          ) : (
            <div className="space-y-1">
              {openJobs.map((job) => (
                <Link key={job.id} href={`/landlord/jobs/${job.id}`} className="block rounded-xl px-2 -mx-2 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-white font-medium text-sm">{job.category}</p>
                    {job.is_emergency && (
                      <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-semibold">
                        Emergency
                      </span>
                    )}
                  </div>
                  <p className="text-white/50 text-xs">{job.description}</p>
                  <p className="text-[#12A5A9] text-xs mt-1">{statusLabel(job.status)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
        </ScrollReveal>

        {/* Job history */}
        <ScrollReveal>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <h2 className="text-white font-semibold mb-4">Job history</h2>
          {jobHistory.length === 0 ? (
            <p className="text-white/30 text-sm">No completed jobs yet.</p>
          ) : (
            <div className="space-y-1">
              {jobHistory.map((job) => (
                <Link key={job.id} href={`/landlord/jobs/${job.id}`} className="block rounded-xl px-2 -mx-2 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all">
                  <p className="text-white font-medium text-sm">{job.category}</p>
                  <p className="text-white/50 text-xs">{job.description}</p>
                  <p className="text-white/30 text-xs mt-1">{statusLabel(job.status)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
        </ScrollReveal>

        {/* Systems & Appliances */}
        <ScrollReveal>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Systems & Appliances</h2>
            <Link
              href={`/landlord/properties/${propertyId}/units/${unitId}/systems`}
              className="text-[#12A5A9] text-sm hover:underline"
            >
              Manage
            </Link>
          </div>
          <p className="text-white/30 text-sm">Track major systems (HVAC, water heater, roof, panel) with service history and replacement cost.</p>
        </div>
        </ScrollReveal>
        </>
        )}

      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
