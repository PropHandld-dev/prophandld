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
import { useLanguage, t } from '@/lib/i18n'

const IN_PROGRESS_STATUSES = ['pending_approval', 'approved', 'bidding', 'bid_selected', 'scheduled', 'in_progress']

export default function UnitDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
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
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [depositRefunded, setDepositRefunded] = useState('')
  const [depositReason, setDepositReason] = useState('')
  const [savingDeposit, setSavingDeposit] = useState(false)
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
          ? `${t('leaseSetForOccupantsPrefix', lang)} ${tenancy.occupants} ${tenancy.occupants === 1 ? t('occupantSingular', lang) : t('occupantPlural', lang)}${t('leaseSetForOccupantsSuffix', lang)}`
          : `${t('reachedDefaultLimitPrefix', lang)} ${maxCoRenters} ${t('reachedDefaultLimitSuffix', lang)}`
      )
      setAddingCoRenter(false)
      return
    }

    const { data: renterId, error: lookupError } = await supabase
      .rpc('get_user_id_by_email', { email_input: coRenterEmail.trim().toLowerCase() })

    if (lookupError || !renterId) {
      setCoRenterError(t('noAccountFoundEmail', lang))
      setAddingCoRenter(false)
      return
    }

    const { error: insertError } = await supabase
      .from('tenancy_occupants')
      .insert({ tenancy_id: tenancy.id, renter_user_id: renterId })

    if (insertError) {
      setCoRenterError(insertError.code === '23505' ? t('alreadyCoRenter', lang) : t('couldNotAddCoRenterColon', lang) + insertError.message)
      setAddingCoRenter(false)
      return
    }

    setCoRenterEmail('')
    await loadCoOccupants(tenancy.id)
    setAddingCoRenter(false)
  }

  const handleRemoveCoRenter = async (occupantId: string) => {
    if (!tenancy) return
    if (!window.confirm(t('removeCoRenterConfirm', lang))) return
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

    // Kicked off now, awaited later — jobs only depends on unitId (already
    // known), so it runs alongside the tenancy/invite branch below instead
    // of waiting for it to finish first.
    const jobsPromise = supabase
      .from('jobs')
      .select('*')
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false })

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

    const { data: jobsData, error: jobsError } = await jobsPromise

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
    if (!window.confirm(`${t('cancelInviteConfirmPrefix', lang)} ${pendingInvite.renter_email}${t('cancelInviteConfirmSuffix', lang)}`)) return

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
        setInviteResendError(data.error || t('couldNotResendInvitePlain', lang))
      } else {
        setInviteResendSuccess(true)
      }
    } catch (err) {
      console.error('invite-renter fetch failed:', err)
      setInviteResendError(t('couldNotResendInvitePlain', lang))
    }

    setInvitingBusy(false)
  }

  const handleConfirmMoveOutDate = async () => {
    if (!moveOutDate) {
      setMoveOutError(t('pleaseSelectMoveOutDate', lang))
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
      setMoveOutError(t('couldNotSetMoveOutDate', lang))
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

  const handleConfirmMoveOutComplete = () => {
    // A typed deposit amount with nothing tracking what actually happened
    // to it at move-out used to be the whole story — this is the one real
    // moment to record it, right where the tenancy actually ends, tied to
    // the same move-out inspection photos already taken. The deposit modal
    // itself is the confirmation step here (Cancel/Confirm) — but when
    // there's no deposit to resolve, this used to skip straight to ending
    // the tenancy with no confirmation at all. Restoring the same plain
    // confirm the no-deposit path always had.
    if (tenancy?.security_deposit) {
      setDepositRefunded(tenancy.security_deposit.toString())
      setDepositReason('')
      setShowDepositModal(true)
      return
    }
    if (!window.confirm(t('confirmTenantMovedOut', lang))) return
    finalizeMoveOut({})
  }

  const finalizeMoveOut = async (depositFields: Record<string, any>) => {
    const { error: updateError } = await expectRow(supabase
      .from('tenancies')
      .update({ ended: true, ...depositFields })
      .eq('id', tenancy.id))

    if (updateError) {
      console.error('Error ending tenancy:', updateError)
      setMoveOutError(t('couldNotEndTenancyColon', lang) + updateError.message)
      return
    }

    setShowDepositModal(false)
    setMoveOutSuccess(true)
    await fetchUnit()
  }

  const submitDepositResolution = async () => {
    const deposit = Number(tenancy.security_deposit) || 0
    const refunded = Number(depositRefunded) || 0
    const kept = Math.max(0, deposit - refunded)

    if (refunded > deposit) {
      setMoveOutError(t('refundCantExceedDeposit', lang))
      return
    }
    if (kept > 0 && !depositReason.trim()) {
      setMoveOutError(t('addReasonForAmountKept', lang))
      return
    }

    setSavingDeposit(true)
    setMoveOutError(null)
    await finalizeMoveOut({
      security_deposit_refunded: refunded,
      security_deposit_kept: kept,
      security_deposit_kept_reason: kept > 0 ? depositReason.trim() : null,
      security_deposit_resolved_at: new Date().toISOString(),
    })
    setSavingDeposit(false)
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
      setTenancyEditError(t('couldNotSaveTenancyChanges', lang))
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
      pending_approval: t('statusNeedsApproval', lang),
      approved: t('statusAcknowledged', lang),
      bidding: t('statusBidding', lang),
      bid_selected: t('statusBidSelected', lang),
      scheduled: t('statusScheduledFull', lang),
      in_progress: t('statusInProgressFull', lang),
      completed: t('statusCompleted', lang),
      archived: t('statusArchived', lang),
      declined: t('statusDeclined', lang),
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
          {t('backToPropertyArrow', lang)}
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
          {unit.floor && <p className="text-white/50 text-sm mt-1">{t('floorLabelPrefix', lang)} {unit.floor}</p>}
          {unit.sqft && <p className="text-white/50 text-sm">{unit.sqft} {t('sqftSuffixWord', lang)}</p>}
        </div>

        {moveOutSuccess && (
          <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
            <p className="text-[#12A5A9] text-sm font-medium">
              {t('tenancyEndedVacantMsg', lang)}
            </p>
          </div>
        )}

        {/* Tenant section */}
        <ScrollReveal>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">{t('tenantHeading', lang)}</h2>
            {!tenancy && !pendingInvite && (
              <MagneticLink
                href={`/landlord/properties/${propertyId}/units/${unitId}/tenancy/new`}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition"
              >
                {t('linkRenterBtn', lang)}
              </MagneticLink>
            )}
            {tenancy && !editingTenancy && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleMessageTenant}
                  disabled={messagingTenant}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50"
                >
                  {messagingTenant ? t('openingEllipsis', lang) : t('messageBtn', lang)}
                </button>
                <button
                  onClick={openTenancyEdit}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline"
                >
                  {t('editBtn', lang)}
                </button>
              </div>
            )}
          </div>

          {tenancy && tenantLookupFailed ? (
            <p className="text-yellow-400/70 text-sm">
              {t('tenantLinkedUnavailable', lang)}
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
                  ${tenancy.rent_amount}{t('perMonthCommaPrefix', lang)}{t('dueTheDayPrefix', lang)} {lang === 'es' ? (tenancy.rent_due_day ?? 1) : ordinal(tenancy.rent_due_day ?? 1)}
                </p>
              )}
              {tenancy.lease_start && (
                <p className="text-white/60 text-sm flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-white/60" />
                  {new Date(tenancy.lease_start + 'T00:00:00').toLocaleDateString()}
                  {tenancy.lease_end ? ` → ${new Date(tenancy.lease_end + 'T00:00:00').toLocaleDateString()}` : ` ${t('arrowOngoingSuffix', lang)}`}
                </p>
              )}

              {!editingTenancy && tenancy.escalation_percent && tenancy.escalation_frequency_months && (
                <p className="text-white/60 text-sm">
                  📈 +{tenancy.escalation_percent}{t('percentEveryPrefix', lang)} {tenancy.escalation_frequency_months} {t('monthsWord', lang)}
                  {tenancy.lease_start && (() => {
                    const next = nextEscalationDate(tenancy.lease_start, tenancy.escalation_frequency_months)
                    return next ? `${t('nextDuePrefix', lang)} ${next.toLocaleDateString()}` : ''
                  })()}
                </p>
              )}

              {!editingTenancy && tenancy.late_fee_amount && (
                <p className="text-white/60 text-sm">
                  ⏰ ${tenancy.late_fee_amount} {t('lateFeeAfterPrefix', lang)} {tenancy.grace_period_days ?? 5} {t('daysWord', lang)}
                </p>
              )}

              {!editingTenancy && tenancy.occupants && (
                <p className="text-white/60 text-sm flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-white/60" />
                  {tenancy.occupants} {tenancy.occupants === 1 ? t('occupantSingular', lang) : t('occupantPlural', lang)}
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
                  <p className="text-white/70 text-xs font-semibold mb-2">{t('coRentersHeading', lang)}</p>
                  {coOccupants.length === 0 ? (
                    <p className="text-white/40 text-xs mb-3">{t('noCoRentersDesc', lang)}</p>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {coOccupants.map((o) => (
                        <div key={o.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-white text-sm">{o.users?.full_name || t('unknownLabel', lang)}</p>
                            <p className="text-white/40 text-xs">{o.users?.email}</p>
                          </div>
                          <button
                            onClick={() => handleRemoveCoRenter(o.id)}
                            className="text-red-400/70 hover:text-red-400 text-xs transition"
                          >
                            {t('removeBtn', lang)}
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
                      placeholder={t('coRenterEmailPlaceholder', lang)}
                      className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                    />
                    <button
                      onClick={handleAddCoRenter}
                      disabled={addingCoRenter || !coRenterEmail.trim()}
                      className="shrink-0 bg-white/8 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-white/12 transition disabled:opacity-50"
                    >
                      {addingCoRenter ? t('addingDots', lang) : t('addBtn', lang)}
                    </button>
                  </div>
                  {coRenterError && <p className="text-red-400 text-xs mt-2">{coRenterError}</p>}
                </div>
              )}

              {!editingTenancy && tenantBackupContacts.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-2">
                  <p className="text-white/70 text-xs font-semibold mb-1">{t('ifTheyDontAnswer', lang)}</p>
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
                      <label className="text-white/70 text-xs block mb-1">{t('monthlyRentDollarLabel', lang)}</label>
                      <input
                        type="number"
                        name="rent_amount"
                        value={editForm.rent_amount}
                        onChange={handleEditFormChange}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-xs block mb-1">{t('dueDayOfMonthLabel', lang)}</label>
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
                      <label className="text-white/70 text-xs block mb-1">{t('escalationPercentLabelShort', lang)}</label>
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
                      <label className="text-white/70 text-xs block mb-1">{t('everyMonthsLabel', lang)}</label>
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
                      <label className="text-white/70 text-xs block mb-1">{t('lateFeeOptionalLabel', lang)}</label>
                      <input
                        type="number"
                        name="late_fee_amount"
                        value={editForm.late_fee_amount}
                        onChange={handleEditFormChange}
                        placeholder={t('noFeePlaceholder', lang)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-xs block mb-1">{t('gracePeriodDaysLabel', lang)}</label>
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
                    {t('lateFeeHelperText', lang)}
                  </p>
                  <div>
                    <label className="text-white/70 text-xs block mb-1">{t('occupantsLabel', lang)}</label>
                    <input
                      type="number"
                      name="occupants"
                      value={editForm.occupants}
                      onChange={handleEditFormChange}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                    />
                  </div>
                  <div>
                    <label className="text-white/70 text-xs block mb-1">{t('petsLabel', lang)}</label>
                    <input
                      type="text"
                      name="pets"
                      value={editForm.pets}
                      onChange={handleEditFormChange}
                      placeholder={t('petsPlaceholder', lang)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                    />
                  </div>
                  <div>
                    <label className="text-white/70 text-xs block mb-1">{t('leaseNotesLabel', lang)}</label>
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
                      {savingTenancy ? t('savingDots', lang) : t('saveBtn', lang)}
                    </RippleButton>
                    <button
                      onClick={() => setEditingTenancy(false)}
                      className="text-white/60 text-xs hover:text-white transition"
                    >
                      {t('cancelBtn', lang)}
                    </button>
                  </div>
                </div>
              )}

              {tenancy.move_out_date && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mt-2">
                  <p className="text-yellow-400/80 text-sm">
                    {t('moveOutScheduledPrefix', lang)} {new Date(tenancy.move_out_date + 'T00:00:00').toLocaleDateString()}
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
                  <label className="text-white/70 text-sm block">{t('moveOutDateLabel', lang)}</label>
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
                      {savingMoveOut ? t('savingDots', lang) : t('confirmStartMoveOutInspectionBtn', lang)}
                    </button>
                    <button
                      onClick={() => setShowMoveOutForm(false)}
                      className="text-white/60 text-xs hover:text-white transition"
                    >
                      {t('cancelBtn', lang)}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 mt-2">
                  <Link
                    href={`/landlord/properties/${propertyId}/units/${unitId}/inspection`}
                    className="text-[#12A5A9] text-xs hover:underline"
                  >
                    {t('moveInInspectionLink', lang)}
                  </Link>
                  {tenancy.move_out_date && (
                    <Link
                      href={`/landlord/properties/${propertyId}/units/${unitId}/inspection?type=move_out`}
                      className="text-[#12A5A9] text-xs hover:underline"
                    >
                      {t('moveOutInspectionLink', lang)}
                    </Link>
                  )}
                  {!tenancy.move_out_date ? (
                    <button
                      onClick={handleStartEndTenancy}
                      className="text-red-400/70 text-xs hover:text-red-400 transition"
                    >
                      {t('endTenancyBtn', lang)}
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirmMoveOutComplete}
                      className="text-red-400/70 text-xs hover:text-red-400 transition"
                    >
                      {t('confirmMoveOutCompleteBtn', lang)}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : pendingInvite ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-yellow-400/80 text-sm font-medium">
                {t('invitedColonPrefix', lang)} {pendingInvite.renter_email}
              </p>
              <p className="text-white/60 text-xs mt-1">{t('waitingForSignUp', lang)}</p>
              {inviteResendError && (
                <p className="text-red-400 text-xs mt-2">{inviteResendError}</p>
              )}
              {inviteResendSuccess && (
                <p className="text-[#12A5A9] text-xs mt-2">{t('inviteResentMsg', lang)}</p>
              )}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={handleResendInvite}
                  disabled={invitingBusy}
                  className="text-[#12A5A9] text-xs font-semibold hover:underline disabled:opacity-50"
                >
                  {invitingBusy ? t('sendingDots', lang) : t('resendBtn', lang)}
                </button>
                <button
                  onClick={handleCancelInvite}
                  disabled={invitingBusy}
                  className="text-red-400/70 hover:text-red-400 text-xs transition disabled:opacity-50"
                >
                  {t('cancelInviteBtn', lang)}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-white/50 text-sm">{t('noTenantLinkedVacant', lang)}</p>
          )}
        </div>
        </ScrollReveal>

        {showDepositModal && tenancy && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
            <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-white font-semibold mb-1">{t('securityDepositHeading', lang)}</h3>
              <p className="text-white/50 text-xs mb-4">
                {t('depositCollectedPrefix', lang)}{Number(tenancy.security_deposit).toFixed(2)} {t('depositCollectedSuffix', lang)}
              </p>

              <label className="text-white/70 text-sm block mb-1">{t('amountRefundedLabel', lang)}</label>
              <input
                type="number"
                min="0"
                max={tenancy.security_deposit}
                step="0.01"
                value={depositRefunded}
                onChange={(e) => setDepositRefunded(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition mb-3"
              />

              {Number(tenancy.security_deposit) - (Number(depositRefunded) || 0) > 0 && (
                <>
                  <p className="text-yellow-400 text-xs mb-2">
                    {t('keepingAmountPrefix', lang)}{(Number(tenancy.security_deposit) - (Number(depositRefunded) || 0)).toFixed(2)}{t('reasonRequiredSuffix', lang)}
                  </p>
                  <label className="text-white/70 text-sm block mb-1">{t('reasonLabel', lang)}</label>
                  <textarea
                    value={depositReason}
                    onChange={(e) => setDepositReason(e.target.value)}
                    rows={3}
                    placeholder={t('depositReasonPlaceholder', lang)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-3"
                  />
                </>
              )}

              {moveOutError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
                  {moveOutError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDepositModal(false)}
                  disabled={savingDeposit}
                  className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
                >
                  {t('cancelBtn', lang)}
                </button>
                <button
                  onClick={submitDepositResolution}
                  disabled={savingDeposit}
                  className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
                >
                  {savingDeposit ? t('savingDots', lang) : t('confirmEndTenancyBtn', lang)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rent */}
        {tenancy && (
          <ScrollReveal>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">{t('rentHeading', lang)}</h2>
              <Link
                href={`/landlord/properties/${propertyId}/units/${unitId}/rent`}
                className="text-[#12A5A9] text-sm hover:underline"
              >
                {t('manage', lang)}
              </Link>
            </div>
            {(() => {
              // The month that needs attention: the oldest unpaid one, else the latest paid.
              const rows = [...rentRows].sort((a, b) => a.month.localeCompare(b.month))
              const isPaidRow = (r: any) => Number(r.expected_amount) > 0 && Number(r.actual_amount || 0) >= Number(r.expected_amount)
              const focus = rows.find((r) => !isPaidRow(r)) ?? rows[rows.length - 1]
              if (!focus) {
                return <p className="text-white/50 text-sm">{t('rentMonthsAppearHere', lang)}</p>
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
                ? { text: t('paidStatus', lang), style: 'bg-[#0A7B7E]/20 text-[#12A5A9]' }
                : processing
                  ? { text: t('bankPaymentProcessing', lang), style: 'bg-yellow-500/15 text-yellow-400' }
                  : daysLate > 0
                    ? { text: `${daysLate} ${t('dayLateSuffix', lang)}`, style: 'bg-red-500/15 text-red-400' }
                    : { text: `${t('dueDatePrefix', lang)} ${dueLabel}`, style: 'bg-white/8 text-white/60' }
              const detail = paid
                ? `$${Number(focus.actual_amount).toLocaleString()} ${t('receivedWord', lang)}${focus.paid_date ? ` ${t('onWord', lang)} ${new Date(focus.paid_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
                : `$${Number(focus.actual_amount || 0).toLocaleString()} ${t('ofWord', lang)} $${Number(focus.expected_amount).toLocaleString()}`
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
            <h2 className="text-white font-semibold">{t('openJobsHeading', lang)}</h2>
            <Link
              href={`/landlord/properties/${propertyId}/units/${unitId}/jobs/new`}
              className="text-[#12A5A9] text-xs hover:underline"
            >
              {t('createJobLinkBtn', lang)}
            </Link>
          </div>
          {openJobs.length === 0 ? (
            <p className="text-white/50 text-sm">{t('noOpenJobsUnit', lang)}</p>
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
                          {t('emergency', lang)}
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
          <h2 className="text-white font-semibold mb-4">{t('jobHistoryHeading', lang)}</h2>
          {jobHistory.length === 0 ? (
            <p className="text-white/50 text-sm">{t('noCompletedJobsYet', lang)}</p>
          ) : (
            <div className="space-y-1">
              <ShowMoreList
                items={jobHistory}
                itemKey={(job) => job.id}
                renderItem={(job) => (
                  <Link href={`/landlord/jobs/${job.id}`} className="block rounded-xl px-2 -mx-2 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all">
                    <p className="text-white font-medium text-sm">{job.category}</p>
                    <p className="text-white/50 text-xs">{job.description}</p>
                    <p className="text-white/50 text-xs mt-1">
                      {statusLabel(job.status)}
                      {job.self_completed && (
                        <span className="ml-1.5 text-[#12A5A9]">· {t('diySelfCompletedBadge', lang)}</span>
                      )}
                    </p>
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
            <h2 className="text-white font-semibold">{t('systemsAppliancesHeading', lang)}</h2>
            <Link
              href={`/landlord/properties/${propertyId}/units/${unitId}/systems`}
              className="text-[#12A5A9] text-sm hover:underline"
            >
              {t('manage', lang)}
            </Link>
          </div>
          <p className="text-white/50 text-sm">{t('systemsAppliancesDesc', lang)}</p>
        </div>
        </ScrollReveal>
        </>
        )}

      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
