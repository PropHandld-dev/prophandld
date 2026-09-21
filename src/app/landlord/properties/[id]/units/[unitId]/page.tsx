'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { expectRow } from '@/lib/expectRow'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { DollarSignIcon, CalendarIcon, UserIcon, CheckCircleIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { MagneticLink } from '@/components/MagneticLink'
import { RippleButton } from '@/components/RippleButton'
import { ShowMoreList } from '@/components/ShowMoreList'

const IN_PROGRESS_STATUSES = ['pending_approval', 'approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress']

export default function UnitDetailPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string
  const unitId = params.unitId as string
  const [unit, setUnit] = useState<any>(null)
  const [tenancy, setTenancy] = useState<any>(null)
  const [rentRows, setRentRows] = useState<any[]>([])
  const [pendingInvite, setPendingInvite] = useState<any>(null)
  const [invitingBusy, setInvitingBusy] = useState(false)
  const [inviteResendError, setInviteResendError] = useState<string | null>(null)
  const [inviteResendSuccess, setInviteResendSuccess] = useState(false)
  const [tenantLookupFailed, setTenantLookupFailed] = useState(false)
  const [coOccupants, setCoOccupants] = useState<any[]>([])
  const [tenantBackupContacts, setTenantBackupContacts] = useState<any[]>([])
  const [coRenterEmail, setCoRenterEmail] = useState('')
  const [addingCoRenter, setAddingCoRenter] = useState(false)
  const [coRenterError, setCoRenterError] = useState<string | null>(null)
  const [messagingTenant, setMessagingTenant] = useState(false)
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
    rent_due_day: '1',
    escalation_percent: '',
    escalation_frequency_months: '',
    occupants: '',
    pets: '',
    lease_notes: '',
    late_fee_amount: '',
    grace_period_days: '',
  })

  const loadCoOccupants = async (tenancyId: string) => {
    const { data: occupants } = await supabase
      .from('tenancy_occupants')
      .select('*')
      .eq('tenancy_id', tenancyId)
      .order('added_at', { ascending: true })

    if (!occupants || occupants.length === 0) {
      setCoOccupants([])
      return
    }

    const withNames = await Promise.all(
      occupants.map(async (o) => {
        const { data: renterData } = await supabase.rpc('get_user_by_id', { user_id_input: o.renter_user_id }).maybeSingle()
        return { ...o, users: renterData }
      })
    )
    setCoOccupants(withNames)
  }

  const loadTenantBackupContacts = async (tenancyRow: any) => {
    const { data: occupants } = await supabase
      .from('tenancy_occupants')
      .select('renter_user_id')
      .eq('tenancy_id', tenancyRow.id)

    const userIds = [tenancyRow.renter_user_id, ...(occupants || []).map((o) => o.renter_user_id)]
    const { data } = await supabase
      .from('personal_emergency_contacts')
      .select('*')
      .in('user_id', userIds)

    setTenantBackupContacts(data || [])
  }

  const handleAddCoRenter = async () => {
    if (!tenancy || !coRenterEmail.trim()) return
    setAddingCoRenter(true)
    setCoRenterError(null)

    // Co-renters (this unit's primary tenant plus everyone added here)
    // are capped at the occupant count the landlord set for the lease —
    // that number already represents how many people actually live
    // there, so co-renter accounts shouldn't be able to exceed it.
    // Falls back to a sane default when no occupant count was set.
    const maxCoRenters = tenancy.occupants ? Math.max(tenancy.occupants - 1, 0) : 5
    if (coOccupants.length >= maxCoRenters) {
      setCoRenterError(
        tenancy.occupants
          ? `This lease is set for ${tenancy.occupants} occupant${tenancy.occupants === 1 ? '' : 's'} — update the occupant count first to add more co-renters.`
          : `You've reached the default limit of ${maxCoRenters} co-renters. Set an occupant count on the lease to raise it.`
      )
      setAddingCoRenter(false)
      return
    }

    const { data: renterId, error: lookupError } = await supabase
      .rpc('get_user_id_by_email', { email_input: coRenterEmail.trim().toLowerCase() })

    if (lookupError || !renterId) {
      setCoRenterError('No Prophandld account found with that email. They need to sign up first.')
      setAddingCoRenter(false)
      return
    }

    const { error: insertError } = await supabase
      .from('tenancy_occupants')
      .insert({ tenancy_id: tenancy.id, renter_user_id: renterId })

    if (insertError) {
      setCoRenterError(insertError.code === '23505' ? 'They\'re already a co-renter on this unit.' : 'Could not add co-renter: ' + insertError.message)
      setAddingCoRenter(false)
      return
    }

    setCoRenterEmail('')
    await loadCoOccupants(tenancy.id)
    setAddingCoRenter(false)
  }

  const handleRemoveCoRenter = async (occupantId: string) => {
    if (!tenancy) return
    if (!window.confirm('Remove this co-renter? They\'ll lose access to this unit.')) return
    await supabase.from('tenancy_occupants').delete().eq('id', occupantId)
    await loadCoOccupants(tenancy.id)
  }

  const fetchUnit = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }

    const { data: unitData } = await supabase
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single()

    if (!unitData) {
      router.replace(`/landlord/properties/${propertyId}`)
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
      const [, , rentResult] = await Promise.all([
        loadCoOccupants(tenancyData.id),
        loadTenantBackupContacts(tenancyData),
        supabase
          .from('rent_payments')
          .select('id, month, expected_amount, actual_amount, paid_date, stripe_status')
          .eq('tenancy_id', tenancyData.id)
          .order('month', { ascending: false })
          .limit(6),
      ])
      setRentRows(rentResult.data || [])
    } else {
      setRentRows([])
      setCoOccupants([])
      setTenantBackupContacts([])
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

  const handleMessageTenant = async () => {
    if (!tenancy) return
    setMessagingTenant(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }
    const { data: threadId, error } = await supabase.rpc('start_landlord_tenant_thread', {
      p_landlord_user_id: user.id,
      p_renter_user_id: tenancy.renter_user_id,
    })
    setMessagingTenant(false)
    if (error || !threadId) {
      console.error('Error starting conversation:', error)
      return
    }
    router.push(`/landlord/messages/${threadId}`)
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
    setInviteResendError(null)
    setInviteResendSuccess(false)

    try {
      const res = await fetch('/api/invite-renter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId: pendingInvite.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setInviteResendError(data.error || 'Could not resend invite.')
      } else {
        setInviteResendSuccess(true)
      }
    } catch (err) {
      console.error('invite-renter fetch failed:', err)
      setInviteResendError('Could not resend invite.')
    }

    setInvitingBusy(false)
  }

  const handleConfirmMoveOutDate = async () => {
    if (!moveOutDate) {
      setMoveOutError('Please select a move-out date.')
      return
    }

    setSavingMoveOut(true)
    setMoveOutError(null)

    const { error: updateError } = await expectRow(supabase
      .from('tenancies')
      .update({ move_out_date: moveOutDate })
      .eq('id', tenancy.id))

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

    const { error: updateError } = await expectRow(supabase
      .from('tenancies')
      .update({ ended: true })
      .eq('id', tenancy.id))

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
      rent_due_day: tenancy.rent_due_day?.toString() || '1',
      escalation_percent: tenancy.escalation_percent?.toString() || '',
      escalation_frequency_months: tenancy.escalation_frequency_months?.toString() || '',
      occupants: tenancy.occupants?.toString() || '',
      pets: tenancy.pets || '',
      lease_notes: tenancy.lease_notes || '',
      late_fee_amount: tenancy.late_fee_amount?.toString() || '',
      grace_period_days: tenancy.grace_period_days?.toString() || '5',
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

    const { error: updateError } = await expectRow(supabase
      .from('tenancies')
      .update({
        rent_amount: editForm.rent_amount ? parseFloat(editForm.rent_amount) : null,
        rent_due_day: editForm.rent_due_day ? parseInt(editForm.rent_due_day) : 1,
        escalation_percent: editForm.escalation_percent ? parseFloat(editForm.escalation_percent) : null,
        escalation_frequency_months: editForm.escalation_frequency_months ? parseInt(editForm.escalation_frequency_months) : null,
        occupants: editForm.occupants ? parseInt(editForm.occupants) : null,
        pets: editForm.pets.trim() || null,
        lease_notes: editForm.lease_notes.trim() || null,
        late_fee_amount: editForm.late_fee_amount ? parseFloat(editForm.late_fee_amount) : null,
        grace_period_days: editForm.grace_period_days ? parseInt(editForm.grace_period_days) : 5,
      })
      .eq('id', tenancy.id))

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

  const ordinal = (day: number) => {
    if (day % 10 === 1 && day !== 11) return `${day}st`
    if (day % 10 === 2 && day !== 12) return `${day}nd`
    if (day % 10 === 3 && day !== 13) return `${day}rd`
    return `${day}th`
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
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
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
              <div className="flex items-center gap-3">
                <button
                  onClick={handleMessageTenant}
                  disabled={messagingTenant}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50"
                >
                  {messagingTenant ? 'Opening…' : 'Message'}
                </button>
                <button
                  onClick={openTenancyEdit}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline"
                >
                  Edit
                </button>
              </div>
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
                <p className="text-white/60 text-sm">📞 {tenancy.users.phone}</p>
              )}
              {tenancy.rent_amount && (
                <p className="text-white/60 text-sm flex items-center gap-1.5">
                  <DollarSignIcon className="w-3.5 h-3.5 text-white/60" />
                  ${tenancy.rent_amount}/month, due the {ordinal(tenancy.rent_due_day ?? 1)}
                </p>
              )}
              {tenancy.lease_start && (
                <p className="text-white/60 text-sm flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-white/60" />
                  {new Date(tenancy.lease_start + 'T00:00:00').toLocaleDateString()}
                  {tenancy.lease_end ? ` → ${new Date(tenancy.lease_end + 'T00:00:00').toLocaleDateString()}` : ' → ongoing'}
                </p>
              )}

              {!editingTenancy && tenancy.escalation_percent && tenancy.escalation_frequency_months && (
                <p className="text-white/60 text-sm">
                  📈 +{tenancy.escalation_percent}% every {tenancy.escalation_frequency_months} months
                  {tenancy.lease_start && (() => {
                    const next = nextEscalationDate(tenancy.lease_start, tenancy.escalation_frequency_months)
                    return next ? `, next due ${next.toLocaleDateString()}` : ''
                  })()}
                </p>
              )}

              {!editingTenancy && tenancy.late_fee_amount && (
                <p className="text-white/60 text-sm">
                  ⏰ ${tenancy.late_fee_amount} late fee after {tenancy.grace_period_days ?? 5} days
                </p>
              )}

              {!editingTenancy && tenancy.occupants && (
                <p className="text-white/60 text-sm flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-white/60" />
                  {tenancy.occupants} occupant{tenancy.occupants === 1 ? '' : 's'}
                </p>
              )}

              {!editingTenancy && tenancy.pets && (
                <p className="text-white/60 text-sm">🐾 {tenancy.pets}</p>
              )}

              {!editingTenancy && tenancy.lease_notes && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-2">
                  <p className="text-white/50 text-sm">{tenancy.lease_notes}</p>
                </div>
              )}

              {!editingTenancy && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-2">
                  <p className="text-white/70 text-xs font-semibold mb-2">Co-renters</p>
                  {coOccupants.length === 0 ? (
                    <p className="text-white/40 text-xs mb-3">No co-renters added. Everyone added here gets the same access as the primary tenant: reporting issues and viewing documents.</p>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {coOccupants.map((o) => (
                        <div key={o.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-white text-sm">{o.users?.full_name || 'Unknown'}</p>
                            <p className="text-white/40 text-xs">{o.users?.email}</p>
                          </div>
                          <button
                            onClick={() => handleRemoveCoRenter(o.id)}
                            className="text-red-400/70 hover:text-red-400 text-xs transition"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={coRenterEmail}
                      onChange={(e) => setCoRenterEmail(e.target.value)}
                      placeholder="Co-renter's email"
                      className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                    />
                    <button
                      onClick={handleAddCoRenter}
                      disabled={addingCoRenter || !coRenterEmail.trim()}
                      className="shrink-0 bg-white/8 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-white/12 transition disabled:opacity-50"
                    >
                      {addingCoRenter ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  {coRenterError && <p className="text-red-400 text-xs mt-2">{coRenterError}</p>}
                </div>
              )}

              {!editingTenancy && tenantBackupContacts.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-2">
                  <p className="text-white/70 text-xs font-semibold mb-1">If they don&apos;t answer</p>
                  <div className="space-y-2">
                    {tenantBackupContacts.map((c) => (
                      <div key={c.id}>
                        <p className="text-white text-sm">{c.name}{c.relationship ? ` · ${c.relationship}` : ''}</p>
                        <a href={`tel:${c.phone}`} className="text-[#12A5A9] text-xs hover:underline">{c.phone}</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editingTenancy && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
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
                    <div>
                      <label className="text-white/70 text-xs block mb-1">Due day of month</label>
                      <input
                        type="number"
                        name="rent_due_day"
                        min={1}
                        max={28}
                        value={editForm.rent_due_day}
                        onChange={handleEditFormChange}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-white/70 text-xs block mb-1">Late fee ($, optional)</label>
                      <input
                        type="number"
                        name="late_fee_amount"
                        value={editForm.late_fee_amount}
                        onChange={handleEditFormChange}
                        placeholder="No fee"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-xs block mb-1">Grace period (days)</label>
                      <input
                        type="number"
                        name="grace_period_days"
                        value={editForm.grace_period_days}
                        onChange={handleEditFormChange}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                  </div>
                  <p className="text-white/50 text-[11px] -mt-2">
                    Leave the fee blank for no automatic late fee. If set, it&apos;s added to the amount due (never auto-charged) once the grace period passes with rent unpaid.
                  </p>
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
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
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
                      className="text-white/60 text-xs hover:text-white transition"
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
                      className="text-white/60 text-xs hover:text-white transition"
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
              <p className="text-white/60 text-xs mt-1">Waiting for them to sign up.</p>
              {inviteResendError && (
                <p className="text-red-400 text-xs mt-2">{inviteResendError}</p>
              )}
              {inviteResendSuccess && (
                <p className="text-[#12A5A9] text-xs mt-2">Invite resent.</p>
              )}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={handleResendInvite}
                  disabled={invitingBusy}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50"
                >
                  {invitingBusy ? 'Sending...' : 'Resend'}
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
            <p className="text-white/50 text-sm">No tenant linked. Unit is vacant.</p>
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
            {(() => {
              // The month that needs attention: the oldest unpaid one, else the latest paid.
              const rows = [...rentRows].sort((a, b) => a.month.localeCompare(b.month))
              const isPaidRow = (r: any) => Number(r.expected_amount) > 0 && Number(r.actual_amount || 0) >= Number(r.expected_amount)
              const focus = rows.find((r) => !isPaidRow(r)) ?? rows[rows.length - 1]
              if (!focus) {
                return <p className="text-white/50 text-sm">Rent months appear here once the tenancy is active.</p>
              }
              const paid = isPaidRow(focus)
              const processing = !paid && focus.stripe_status === 'processing'
              const monthDate = new Date(focus.month + 'T00:00:00')
              const dueDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), tenancy.rent_due_day || 1)
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const daysLate = Math.round((today.getTime() - dueDate.getTime()) / 86400000)
              const monthLabel = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
              const dueLabel = dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              const pill = paid
                ? { text: 'Paid', style: 'bg-[#0A7B7E]/20 text-[#12A5A9]' }
                : processing
                  ? { text: 'Bank payment processing', style: 'bg-yellow-500/15 text-yellow-400' }
                  : daysLate > 0
                    ? { text: `${daysLate} day${daysLate === 1 ? '' : 's'} late`, style: 'bg-red-500/15 text-red-400' }
                    : { text: `Due ${dueLabel}`, style: 'bg-white/8 text-white/60' }
              const detail = paid
                ? `$${Number(focus.actual_amount).toLocaleString()} received${focus.paid_date ? ` on ${new Date(focus.paid_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
                : `$${Number(focus.actual_amount || 0).toLocaleString()} of $${Number(focus.expected_amount).toLocaleString()}`
              return (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{monthLabel}</p>
                    <p className="text-white/50 text-xs mt-0.5">{detail}</p>
                  </div>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${pill.style}`}>{pill.text}</span>
                </div>
              )
            })()}
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
            <p className="text-white/50 text-sm">No open jobs for this unit.</p>
          ) : (
            <div className="space-y-1">
              <ShowMoreList
                items={openJobs}
                itemKey={(job) => job.id}
                renderItem={(job) => (
                  <Link href={`/landlord/jobs/${job.id}`} className="block rounded-xl px-2 -mx-2 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all">
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
                )}
              />
            </div>
          )}
        </div>
        </ScrollReveal>

        {/* Job history */}
        <ScrollReveal>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <h2 className="text-white font-semibold mb-4">Job history</h2>
          {jobHistory.length === 0 ? (
            <p className="text-white/50 text-sm">No completed jobs yet.</p>
          ) : (
            <div className="space-y-1">
              <ShowMoreList
                items={jobHistory}
                itemKey={(job) => job.id}
                renderItem={(job) => (
                  <Link href={`/landlord/jobs/${job.id}`} className="block rounded-xl px-2 -mx-2 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all">
                    <p className="text-white font-medium text-sm">{job.category}</p>
                    <p className="text-white/50 text-xs">{job.description}</p>
                    <p className="text-white/50 text-xs mt-1">{statusLabel(job.status)}</p>
                  </Link>
                )}
              />
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
          <p className="text-white/50 text-sm">Track major systems (HVAC, water heater, roof, panel) with service history and replacement cost.</p>
        </div>
        </ScrollReveal>
        </>
        )}

      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
