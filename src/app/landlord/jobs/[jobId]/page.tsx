'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { PhotoGrid } from '@/components/PhotoGrid'
import { notify } from '@/lib/notify'
import { postJobStatusMessage } from '@/lib/systemMessage'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { WrenchIcon, CheckCircleIcon, MessageCircleIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ReviewForm } from '@/components/ReviewForm'
import { StripePaymentModal } from '@/components/StripePaymentModal'
import { RaiseDisputeButton } from '@/components/RaiseDisputeButton'
import { UnreadDot } from '@/components/UnreadDot'
import { getUnreadJobIds } from '@/lib/messageReads'
import { useJobRealtime } from '@/lib/useJobRealtime'
import { TIME_WINDOWS, validateScheduleTime, rescheduleLockError } from '@/lib/scheduleWindows'

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasUnread, setHasUnread] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [verifiedContractorIds, setVerifiedContractorIds] = useState<Set<string>>(new Set())
  const [unlicensedContractorIds, setUnlicensedContractorIds] = useState<Set<string>>(new Set())
  const [ratingSummaries, setRatingSummaries] = useState<Record<string, { avg_rating: number; review_count: number }>>({})
  const [error, setError] = useState<string | null>(null)
  const [actioning, setActioning] = useState(false)

  const [showBiddingModal, setShowBiddingModal] = useState(false)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineNote, setDeclineNote] = useState('')
  const [showSelectModal, setShowSelectModal] = useState(false)
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [payingContractor, setPayingContractor] = useState(false)
  const [paymentModal, setPaymentModal] = useState<{ clientSecret: string; amount: number } | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [showClarifyModal, setShowClarifyModal] = useState(false)
  const [clarifyNote, setClarifyNote] = useState('')
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [priceAction, setPriceAction] = useState<'approve' | 'reject' | null>(null)

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleWindow, setScheduleWindow] = useState('morning')
  const [scheduleTime, setScheduleTime] = useState('')

  const fetchJob = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }
    setUserId(user.id)
    getUnreadJobIds([jobId], user.id).then((unread) => setHasUnread(unread.has(jobId)))

    const { data: jobData, error: jobError } = await supabase
      .from('jobs')
      .select('*, units(unit_number, property_id, properties(id, address, city, state)), maintenance_items(name, item_type, brand, model, install_date)')
      .eq('id', jobId)
      .maybeSingle()

    if (jobError || !jobData) {
      console.error('Error loading job:', jobError)
      setError('Job not found.')
      setLoading(false)
      return
    }

    if (jobData.status === 'pending_review' && jobData.contractor_completed_at) {
      const completedAt = new Date(jobData.contractor_completed_at).getTime()
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000
      if (Date.now() - completedAt > threeDaysMs) {
        const approvedAt = new Date().toISOString()
        await supabase.from('jobs').update({ status: 'completed', landlord_approved_at: approvedAt }).eq('id', jobId)
        jobData.status = 'completed'
        jobData.landlord_approved_at = approvedAt
        notify('job_completed', jobId)
      }
    }

    const { data: reporterData } = await supabase
      .rpc('get_user_by_id', { user_id_input: jobData.reported_by })
      .maybeSingle()

    setJob({ ...jobData, reporter: reporterData })

    const { data: photosData, error: photosError } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })

    if (photosError) {
      console.error('Error loading photos:', photosError)
    } else if (photosData && photosData.length > 0) {
      const enriched = await Promise.all(
        photosData.map(async (photo) => {
          const { data: uploaderData } = await supabase
            .rpc('get_user_by_id', { user_id_input: photo.uploaded_by })
            .maybeSingle()

          const { data: signedUrlData } = await supabase.storage
            .from('job-photos')
            .createSignedUrl(photo.photo_url, 3600)

          return { ...photo, uploader: uploaderData, displayUrl: signedUrlData?.signedUrl }
        })
      )
      setPhotos(enriched)
    } else {
      setPhotos([])
    }

    if (['bidding', 'bid_selected', 'scheduled', 'in_progress', 'pending_review', 'completed', 'archived'].includes(jobData.status)) {
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('*')
        .eq('job_id', jobId)
        .order('amount', { ascending: true })

      if (bidsError) {
        console.error('Error loading bids:', bidsError)
      } else if (bidsData) {
        const enrichedBids = await Promise.all(
          bidsData.map(async (bid) => {
            const { data: contractorData } = await supabase
              .rpc('get_user_by_id', { user_id_input: bid.contractor_user_id })
              .maybeSingle()
            return { ...bid, contractor: contractorData }
          })
        )
        setBids(enrichedBids)

        const { data: verifsData } = await supabase
          .from('contractor_verifications')
          .select('contractor_user_id, status')
          .in('contractor_user_id', bidsData.map((b) => b.contractor_user_id))

        if (verifsData) {
          setVerifiedContractorIds(
            new Set(verifsData.filter((v) => v.status === 'verified').map((v) => v.contractor_user_id))
          )
          setUnlicensedContractorIds(
            new Set(verifsData.filter((v) => v.status === 'unlicensed').map((v) => v.contractor_user_id))
          )
        }

        const uniqueContractorIds = Array.from(new Set(bidsData.map((b) => b.contractor_user_id)))
        const summaries = await Promise.all(
          uniqueContractorIds.map(async (contractorId) => {
            const { data } = await supabase
              .rpc('get_contractor_rating_summary', { target_contractor_id: contractorId })
              .maybeSingle()
            return [contractorId, data as { avg_rating: number; review_count: number } | null] as const
          })
        )
        const summaryMap: Record<string, { avg_rating: number; review_count: number }> = {}
        summaries.forEach(([contractorId, data]) => {
          if (data && data.review_count > 0) summaryMap[contractorId] = data
        })
        setRatingSummaries(summaryMap)
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchJob()
  }, [jobId, router])

  useJobRealtime(jobId, fetchJob)

  const handleDeletePhoto = async (photo: any) => {
    const { error: storageError } = await supabase.storage.from('job-photos').remove([photo.photo_url])
    if (storageError) {
      console.error('Error deleting photo from storage:', storageError)
    }

    const { error: deleteError } = await supabase.from('job_photos').delete().eq('id', photo.id)
    if (deleteError) {
      console.error('Error deleting photo record:', deleteError)
      setError('Could not remove photo.')
      return
    }

    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
  }

  const handleApproveClick = async () => {
    setActioning(true)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'approved' })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error acknowledging job:', updateError)
      setError('Could not acknowledge job.')
      setActioning(false)
      return
    }

    setActioning(false)
    setShowBiddingModal(true)
  }

  const confirmStartBidding = async () => {
    setActioning(true)
    const { error: biddingError } = await supabase
      .from('jobs')
      .update({ status: 'bidding' })
      .eq('id', jobId)

    if (biddingError) {
      console.error('Error starting bidding:', biddingError)
      setError('Acknowledged, but could not start bidding.')
    }

    setShowBiddingModal(false)
    await fetchJob()
    setActioning(false)
  }

  const skipBidding = async () => {
    setShowBiddingModal(false)
    await fetchJob()
  }

  const handleDeclineClick = () => {
    setDeclineNote('')
    setShowDeclineModal(true)
  }

  const confirmDecline = async () => {
    setActioning(true)

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'declined', landlord_notes: declineNote || null })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error declining job:', updateError)
      setError('Could not decline job.')
    } else {
      notify('job_declined', jobId)
    }

    setShowDeclineModal(false)
    await fetchJob()
    setActioning(false)
  }

  const handleStartBidding = async () => {
    setActioning(true)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'bidding' })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error starting bidding:', updateError)
      setError('Could not start bidding.')
    }

    await fetchJob()
    setActioning(false)
  }

  const handleSelectBidClick = (bidId: string) => {
    setSelectedBidId(bidId)
    setShowSelectModal(true)
  }

  const confirmSelectBid = async () => {
    if (!selectedBidId) return

    setActioning(true)
    setError(null)

    const { error: selectError } = await supabase
      .from('bids')
      .update({ status: 'accepted', selected_at: new Date().toISOString() })
      .eq('id', selectedBidId)

    if (selectError) {
      console.error('Error selecting bid:', selectError)
      setError('Could not select this bid.')
      setActioning(false)
      setShowSelectModal(false)
      return
    }

    const { error: declineOthersError } = await supabase
      .from('bids')
      .update({ status: 'declined' })
      .eq('job_id', jobId)
      .neq('id', selectedBidId)

    if (declineOthersError) {
      console.error('Error declining other bids:', declineOthersError)
    }

    const { error: jobUpdateError } = await supabase
      .from('jobs')
      .update({ status: 'bid_selected' })
      .eq('id', jobId)

    if (jobUpdateError) {
      console.error('Error updating job status:', jobUpdateError)
      setError('Bid selected, but job status failed to update.')
    } else {
      notify('contractor_selected', jobId)
      if (userId) {
        const contractorName = selectedBid?.contractor?.full_name || 'Contractor'
        postJobStatusMessage(jobId, userId, `✓ ${contractorName} selected for this job`)
      }
    }

    setShowSelectModal(false)
    setSelectedBidId(null)
    await fetchJob()
    setActioning(false)
  }

  const openScheduleModal = () => {
    setScheduleDate(job.proposed_date || '')
    setScheduleWindow(job.proposed_window || 'morning')
    setScheduleTime(job.proposed_time || '')
    setShowScheduleModal(true)
  }

  const submitProposal = async () => {
    if (!scheduleDate) {
      setError('Please pick a date.')
      return
    }

    const timeError = validateScheduleTime(scheduleWindow, scheduleTime)
    if (timeError) {
      setError(timeError)
      return
    }

    if (job.schedule_confirmed && job.proposed_date) {
      const lockError = rescheduleLockError(job.proposed_date)
      if (lockError) {
        setError(lockError)
        return
      }
    }

    setActioning(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        proposed_date: scheduleDate,
        proposed_window: scheduleWindow,
        proposed_time: scheduleTime || null,
        proposed_by: 'landlord',
        schedule_confirmed: false,
        schedule_ask_tenant: false,
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error proposing schedule:', updateError)
      setError('Could not propose a schedule.')
      setActioning(false)
      return
    }

    notify('schedule_proposed', jobId, 'landlord')
    setShowScheduleModal(false)
    await fetchJob()
    setActioning(false)
  }

  const askTenantToPropose = async () => {
    setActioning(true)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ schedule_ask_tenant: true })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error asking tenant to propose:', updateError)
      setError('Could not send request.')
    }

    await fetchJob()
    setActioning(false)
  }

  const confirmSchedule = async () => {
    setActioning(true)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ schedule_confirmed: true, status: 'scheduled' })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error confirming schedule:', updateError)
      setError('Could not confirm the schedule.')
    } else {
      notify('schedule_confirmed', jobId)
    }

    await fetchJob()
    setActioning(false)
  }

  const handleArchive = async () => {
    setActioning(true)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'archived' })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error archiving job:', updateError)
      setError('Could not archive job.')
    }

    setShowArchiveModal(false)
    await fetchJob()
    setActioning(false)
  }

  const confirmApproveCompletion = async () => {
    setActioning(true)
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'completed', landlord_approved_at: new Date().toISOString() })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error approving completion:', updateError)
      setError('Could not approve completion: ' + updateError.message)
    } else {
      notify('job_completed', jobId)
      if (userId) postJobStatusMessage(jobId, userId, '✓ Job approved, payment released')
    }

    setShowApproveModal(false)
    await fetchJob()
    setActioning(false)
  }

  const openClarifyModal = () => {
    setClarifyNote(job.clarification_note || '')
    setShowClarifyModal(true)
  }

  const submitClarifyRequest = async () => {
    if (!clarifyNote.trim()) {
      setError('Please enter what you need clarified.')
      return
    }

    setActioning(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ clarification_note: clarifyNote, clarification_response: null })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error sending clarification request:', updateError)
      setError('Could not send request.')
      setActioning(false)
      return
    }

    notify('clarification_requested', jobId)
    setShowClarifyModal(false)
    await fetchJob()
    setActioning(false)
  }

  const openPriceModal = (action: 'approve' | 'reject') => {
    setPriceAction(action)
    setShowPriceModal(true)
  }

  const confirmPriceAction = async () => {
    const acceptedBid = bids.find((b) => b.status === 'accepted')
    if (!acceptedBid) return

    setActioning(true)
    setError(null)

    if (priceAction === 'approve') {
      const { error: updateError } = await supabase
        .from('bids')
        .update({
          amount: acceptedBid.proposed_amount,
          price_change_status: 'approved',
        })
        .eq('id', acceptedBid.id)

      if (updateError) {
        console.error('Error approving price change:', updateError)
        setError('Could not approve price change.')
        setActioning(false)
        return
      }
    } else {
      const { error: updateError } = await supabase
        .from('bids')
        .update({ price_change_status: 'rejected' })
        .eq('id', acceptedBid.id)

      if (updateError) {
        console.error('Error rejecting price change:', updateError)
        setError('Could not reject price change.')
        setActioning(false)
        return
      }
    }

    notify(priceAction === 'approve' ? 'price_change_approved' : 'price_change_rejected', jobId)
    setShowPriceModal(false)
    setPriceAction(null)
    await fetchJob()
    setActioning(false)
  }

  const handlePayContractor = async () => {
    const acceptedBid = bids.find((b) => b.status === 'accepted')
    if (!acceptedBid) return

    setPayingContractor(true)
    setPaymentError(null)

    try {
      const res = await fetch('/api/stripe/job-payment/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId: acceptedBid.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) {
        setPaymentError(data.error || 'Could not start payment.')
        setPayingContractor(false)
        return
      }
      setPaymentModal({ clientSecret: data.clientSecret, amount: data.amount })
    } catch {
      setPaymentError('Could not start payment.')
    }
    setPayingContractor(false)
  }

  const handlePaymentSuccess = async () => {
    setPaymentModal(null)
    await fetchJob()
  }

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending_approval: 'Needs approval',
      approved: 'Acknowledged',
      bidding: 'Getting bids',
      bid_selected: 'Contractor selected',
      scheduled: 'Scheduled',
      in_progress: 'In progress',
      pending_review: 'Pending your review',
      completed: 'Completed',
      archived: 'Archived',
      declined: 'Declined',
      disputed: 'Under dispute review',
    }
    return labels[status] || status
  }

  const disputeEligible =
    job?.status === 'pending_review' ||
    (job?.status === 'completed' &&
      job?.landlord_approved_at &&
      Date.now() - new Date(job.landlord_approved_at).getTime() < 48 * 60 * 60 * 1000)

  const windowLabel = (w: string) => TIME_WINDOWS.find((t) => t.value === w)?.label || w

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord/jobs" className="text-white/50 hover:text-white text-sm transition">
          ← Jobs
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>
      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        <div className="mb-6">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-36 mb-4" />
        <Skeleton className="h-32 mb-4" />
        <Skeleton className="h-48" />
      </main>
      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )

  if (error && !job) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">{error}</div>
    </div>
  )

  if (!job) return null

  const selectedBid = bids.find((b) => b.id === selectedBidId)
  const acceptedBid = bids.find((b) => b.status === 'accepted')
  // Excludes 'declined' bids from a prior round — a job that reopened
  // after the selected contractor cancelled otherwise showed every
  // losing (and the cancelling contractor's own) bid with a live
  // "Select this contractor" button, including the one who just backed out.
  const openBids = bids.filter((b) => b.status === 'pending')
  const showSchedulingSection = ['bid_selected', 'scheduled'].includes(job.status)
  const isMyTurnToRespond = job.proposed_by && job.proposed_by !== 'landlord' && !job.schedule_confirmed
  const beforePhotos = photos.filter((p) => p.stage === 'before')
  const afterPhotos = photos.filter((p) => p.stage === 'after')
  const generalPhotos = photos.filter((p) => p.stage === 'general' || !p.stage)

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord/jobs" className="text-white/50 hover:text-white text-sm transition">
          ← Jobs
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <Link href={`/landlord/jobs/${jobId}/chat`} className="relative text-white/50 hover:text-white transition">
          <MessageCircleIcon className="w-5 h-5" />
          {hasUnread && <UnreadDot className="absolute -top-0.5 -right-0.5" />}
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">

        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-2xl font-bold text-white">{job.category}</h1>
                {job.is_emergency && (
                  <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2.5 py-1 font-semibold">
                    Emergency
                  </span>
                )}
              </div>
              <p className="text-white/60 text-sm">
                {job.units?.properties?.address}, {job.units?.properties?.city} · Unit {job.units?.unit_number}
              </p>
              {job.maintenance_items && (
                <p className="text-[#12A5A9] text-xs mt-1 flex items-center gap-1">
                  <WrenchIcon className="w-3 h-3" />
                  {job.maintenance_items.name}
                  {job.maintenance_items.brand && `, ${job.maintenance_items.brand}`}
                  {job.maintenance_items.install_date && `, installed ${new Date(job.maintenance_items.install_date + 'T00:00:00').getFullYear()}`}
                </p>
              )}
            </div>
            {job.status === 'completed' && (
              <button
                onClick={() => setShowArchiveModal(true)}
                className="text-white/60 hover:text-white text-xs transition shrink-0"
              >
                Archive
              </button>
            )}
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">
              Status: <span className="text-[#12A5A9]">{statusLabel(job.status)}</span>
            </h2>
            {job.status === 'pending_approval' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleApproveClick}
                  disabled={actioning}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  Acknowledge
                </button>
                <button
                  onClick={handleDeclineClick}
                  disabled={actioning}
                  className="text-red-400/70 hover:text-red-400 text-xs transition"
                >
                  Decline
                </button>
              </div>
            )}
            {job.status === 'approved' && (
              <button
                onClick={handleStartBidding}
                disabled={actioning}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                Start bidding
              </button>
            )}
            {job.status === 'pending_review' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowApproveModal(true)}
                  disabled={actioning}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={openClarifyModal}
                  disabled={actioning}
                  className="text-white/50 hover:text-white text-xs transition"
                >
                  Ask for verification
                </button>
              </div>
            )}
          </div>

          <p className="text-white/70 text-sm leading-relaxed">{job.description}</p>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
            <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-1 capitalize">
              {job.urgency} urgency
            </span>
          </div>

          <p className="text-white/50 text-xs mt-3">
            Reported by {job.reporter?.full_name || 'Unknown'} · {new Date(job.created_at).toLocaleString()}
          </p>

          {job.landlord_notes && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-3">
              <p className="text-white/50 text-xs">Note: {job.landlord_notes}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
              {error}
            </div>
          )}
        </div>

        {job.status === 'pending_review' && (job.clarification_note || job.clarification_response) && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6 mb-4">
            <h3 className="text-yellow-400 font-semibold mb-2">Verification requested</h3>
            {job.clarification_note && (
              <div className="mb-3">
                <p className="text-white/60 text-xs mb-1">You asked:</p>
                <p className="text-white/70 text-sm">{job.clarification_note}</p>
              </div>
            )}
            {job.clarification_response ? (
              <div>
                <p className="text-white/60 text-xs mb-1">Contractor responded:</p>
                <p className="text-white/70 text-sm">{job.clarification_response}</p>
              </div>
            ) : (
              <p className="text-white/60 text-xs italic">Waiting on contractor's response.</p>
            )}
          </div>
        )}

        {job.status === 'pending_review' && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 mb-4">
            <p className="text-white/60 text-xs">
              ⏳ This will auto-approve within 3 days of the contractor marking it complete if you don&apos;t take action.
            </p>
          </div>
        )}

        {job.status === 'disputed' && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6 mb-4">
            <h3 className="text-yellow-400 font-semibold mb-1">Under dispute review</h3>
            <p className="text-white/60 text-sm">
              Prophandld is reviewing a dispute on this job. Everyone involved will be notified once it&apos;s resolved.
            </p>
          </div>
        )}

        {disputeEligible && (
          <div className="mb-4">
            <RaiseDisputeButton jobId={jobId} onRaised={fetchJob} />
          </div>
        )}

        {job.status === 'bidding' && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">
              Sealed bids {openBids.length > 0 && `(${openBids.length})`}
            </h3>
            {openBids.length === 0 ? (
              <p className="text-white/50 text-sm">No bids yet. Contractors in range have been notified.</p>
            ) : (
              <div className="space-y-3">
                {openBids.map((bid) => (
                  <div key={bid.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold">{bid.contractor?.full_name || 'Unknown contractor'}</p>
                        {verifiedContractorIds.has(bid.contractor_user_id) && (
                          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">
                            Verified ✓
                          </span>
                        )}
                        {unlicensedContractorIds.has(bid.contractor_user_id) && (
                          <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5 font-semibold">
                            No license on file
                          </span>
                        )}
                        {ratingSummaries[bid.contractor_user_id] && (
                          <span className="text-xs bg-white/8 text-white/60 rounded-full px-2 py-0.5 font-semibold">
                            ★ {ratingSummaries[bid.contractor_user_id].avg_rating.toFixed(1)} ({ratingSummaries[bid.contractor_user_id].review_count})
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[#12A5A9] font-bold">${bid.amount}</p>
                        {bid.pricing_type === 'hourly' && bid.labor_rate && (
                          <p className="text-white/40 text-[11px]">${bid.labor_rate}/hr</p>
                        )}
                      </div>
                    </div>
                    {bid.availability && <p className="text-white/50 text-xs">Availability: {bid.availability}</p>}
                    {bid.estimated_hours && <p className="text-white/50 text-xs">Est. hours: {bid.estimated_hours}</p>}
                    {bid.notes && <p className="text-white/60 text-xs mt-1 italic">{bid.notes}</p>}
                    {bid.not_included && (
                      <p className="text-yellow-400/80 text-xs mt-1">Not included: {bid.not_included}</p>
                    )}
                    <RippleButton
                      onClick={() => handleSelectBidClick(bid.id)}
                      disabled={actioning}
                      className="mt-3 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      Select this contractor
                    </RippleButton>
                  </div>
                ))}
              </div>
            )}
          </ScrollReveal>
        )}

        {['bid_selected', 'scheduled', 'in_progress', 'pending_review', 'completed', 'archived'].includes(job.status) && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-3">Selected contractor</h3>
            {acceptedBid && (
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold">{acceptedBid.contractor?.full_name}</p>
                  {verifiedContractorIds.has(acceptedBid.contractor_user_id) && (
                    <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">
                      Verified ✓
                    </span>
                  )}
                  {unlicensedContractorIds.has(acceptedBid.contractor_user_id) && (
                    <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5 font-semibold">
                      No license on file
                    </span>
                  )}
                  {ratingSummaries[acceptedBid.contractor_user_id] && (
                    <span className="text-xs bg-white/8 text-white/60 rounded-full px-2 py-0.5 font-semibold">
                      ★ {ratingSummaries[acceptedBid.contractor_user_id].avg_rating.toFixed(1)} ({ratingSummaries[acceptedBid.contractor_user_id].review_count})
                    </span>
                  )}
                </div>
                {acceptedBid.price_change_status === 'pending' ? (
  <div className="mt-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
    <p className="text-yellow-400 text-xs font-semibold mb-1">Price change requested</p>
    <p className="text-white/60 text-sm line-through">${acceptedBid.amount}</p>
    <p className="text-white font-bold text-lg">${acceptedBid.proposed_amount}</p>
    {(acceptedBid.price_change_labor || acceptedBid.price_change_parts) && (
      <div className="text-white/50 text-xs mt-2 space-y-0.5">
        {acceptedBid.price_change_labor && <p>Labor: ${acceptedBid.price_change_labor}</p>}
        {acceptedBid.price_change_parts && <p>Parts: ${acceptedBid.price_change_parts}</p>}
      </div>
    )}
    {acceptedBid.price_change_reason && (
      <p className="text-white/60 text-sm mt-2">{acceptedBid.price_change_reason}</p>
    )}
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={() => openPriceModal('approve')}
                        disabled={actioning}
                        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                      >
                        Approve new price
                      </button>
                      <button
                        onClick={() => openPriceModal('reject')}
                        disabled={actioning}
                        className="text-red-400/70 hover:text-red-400 text-xs transition"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[#12A5A9] font-bold text-sm mt-1">
                    ${acceptedBid.amount}
                    {acceptedBid.pricing_type === 'hourly' && acceptedBid.labor_rate && (
                      <span className="text-white/40 font-normal text-xs ml-1.5">(${acceptedBid.labor_rate}/hr)</span>
                    )}
                  </p>
                )}
                {acceptedBid.availability && <p className="text-white/50 text-xs mt-1">Availability: {acceptedBid.availability}</p>}
              </div>
            )}
          </div>
        )}

        {['completed', 'archived'].includes(job.status) && acceptedBid && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">Pay contractor</h3>
                <p className="text-white/60 text-sm mt-1">
                  ${acceptedBid.proposed_amount ?? acceptedBid.amount} to {acceptedBid.contractor?.full_name}
                </p>
              </div>
              {acceptedBid.payment_status === 'paid' ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]">
                    <CheckCircleIcon className="w-3 h-3" /> Paid
                  </span>
                  <Link href={`/receipts/job/${acceptedBid.id}`} className="text-[#12A5A9] text-xs font-semibold hover:underline">
                    Receipt
                  </Link>
                </div>
              ) : (
                <RippleButton
                  onClick={handlePayContractor}
                  disabled={payingContractor}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 shrink-0"
                >
                  {payingContractor ? 'Loading...' : 'Pay now'}
                </RippleButton>
              )}
            </div>
            {paymentError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
                {paymentError}
              </div>
            )}
          </div>
        )}

        {['completed', 'archived'].includes(job.status) && acceptedBid && (
          <div className="mb-4">
            <ReviewForm
              jobId={jobId}
              contractorUserId={acceptedBid.contractor_user_id}
              reviewerRole="landlord"
            />
          </div>
        )}

        {showSchedulingSection && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">Schedule</h3>

            {!job.proposed_date ? (
              <div className="text-center py-4">
                <p className="text-white/50 text-sm mb-4">No appointment proposed yet.</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={openScheduleModal}
                    className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition"
                  >
                    Propose a time myself
                  </button>
                  <button
                    onClick={askTenantToPropose}
                    disabled={actioning || job.schedule_ask_tenant}
                    className="bg-white/8 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-white/12 transition disabled:opacity-50"
                  >
                    {job.schedule_ask_tenant ? 'Waiting on tenant...' : 'Let tenant pick a time'}
                  </button>
                </div>
              </div>
            ) : job.schedule_confirmed ? (
              <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3">
                <p className="text-[#12A5A9] text-sm font-medium flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4" /> Confirmed
                </p>
                <p className="text-white text-sm mt-1">
                  {new Date(job.proposed_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {windowLabel(job.proposed_window)}
                  {job.proposed_time && ` · ${job.proposed_time}`}
                </p>
                {rescheduleLockError(job.proposed_date) ? (
                  <p className="text-white/40 text-xs mt-2">{rescheduleLockError(job.proposed_date)}</p>
                ) : (
                  <button
                    onClick={openScheduleModal}
                    disabled={actioning}
                    className="text-white/50 text-xs hover:text-white transition mt-2"
                  >
                    Reschedule
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                <p className="text-yellow-400/80 text-xs mb-1">
                  Proposed by {job.proposed_by === 'landlord' ? 'you' : job.proposed_by}
                </p>
                <p className="text-white text-sm">
                  {new Date(job.proposed_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {windowLabel(job.proposed_window)}
                  {job.proposed_time && ` · ${job.proposed_time}`}
                </p>
                {isMyTurnToRespond ? (
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={confirmSchedule}
                      disabled={actioning}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      Confirm this time
                    </button>
                    <button
                      onClick={openScheduleModal}
                      disabled={actioning}
                      className="text-white/50 text-xs hover:text-white transition"
                    >
                      Propose different time
                    </button>
                  </div>
                ) : (
                  <p className="text-white/60 text-xs mt-3">Waiting on the contractor or tenant to confirm.</p>
                )}
              </div>
            )}
          </div>
        )}

        {['in_progress', 'pending_review', 'completed', 'archived'].includes(job.status) && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">Proof of work</h3>
            <div className="mb-5">
              <p className="text-white/70 text-sm font-medium mb-2">Before ({beforePhotos.length})</p>
              {beforePhotos.length === 0 ? (
                <p className="text-white/50 text-xs">No before photos yet.</p>
              ) : (
                <PhotoGrid photos={beforePhotos} columns={3} />
              )}
            </div>
            <div>
              <p className="text-white/70 text-sm font-medium mb-2">After ({afterPhotos.length})</p>
              {afterPhotos.length === 0 ? (
                <p className="text-white/50 text-xs">No after photos yet.</p>
              ) : (
                <PhotoGrid photos={afterPhotos} columns={3} />
              )}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-white font-semibold mb-3">
            Reported photos {generalPhotos.length > 0 && `(${generalPhotos.length})`}
          </h3>
          {generalPhotos.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
              <p className="text-white/50 text-sm">No photos attached.</p>
            </div>
          ) : (
            <PhotoGrid
              photos={generalPhotos}
              columns={2}
              thumbHeight="h-40"
              currentUserId={userId ?? undefined}
              onDelete={!['completed', 'archived'].includes(job.status) ? handleDeletePhoto : undefined}
            />
          )}
        </div>
      </main>

      {showBiddingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" /> Job acknowledged
            </h3>
            <p className="text-white/50 text-sm mb-6">
              Let contractors within range start submitting sealed bids on this job?
            </p>
            <div className="flex gap-3">
              <button
                onClick={skipBidding}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Not yet
              </button>
              <button
                onClick={confirmStartBidding}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? 'Starting...' : 'Start bidding'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeclineModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Decline this job?</h3>
            <p className="text-white/50 text-sm mb-3">
              Optionally let the renter know why.
            </p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              rows={3}
              placeholder="e.g. Already scheduled with our regular contractor"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-5"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeclineModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDecline}
                disabled={actioning}
                className="flex-1 bg-red-500/20 text-red-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-500/30 transition disabled:opacity-50"
              >
                {actioning ? 'Declining...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSelectModal && selectedBid && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Select this contractor?</h3>
            <p className="text-white/50 text-sm mb-4">
              <span className="text-white font-medium">{selectedBid.contractor?.full_name}</span> for{' '}
              <span className="text-[#12A5A9] font-semibold">${selectedBid.amount}</span>. All other bids will be marked as not selected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSelectModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <RippleButton
                onClick={confirmSelectBid}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? 'Selecting...' : 'Confirm'}
              </RippleButton>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-4">Propose a time</h3>

            <label className="text-white/70 text-sm block mb-1">Date</label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition mb-4"
            />

            <label className="text-white/70 text-sm block mb-1">Time window</label>
            <select
              value={scheduleWindow}
              onChange={(e) => setScheduleWindow(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition mb-4"
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w.value} value={w.value} className="bg-[#0C1A2E]">{w.label}</option>
              ))}
            </select>

            <label className="text-white/70 text-sm block mb-1">Specific time (optional)</label>
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition mb-5"
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowScheduleModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitProposal}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? 'Proposing...' : 'Propose'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchiveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Archive this job?</h3>
            <p className="text-white/50 text-sm mb-6">
              This moves it out of active jobs into your completed history. You can still view it anytime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowArchiveModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showApproveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Approve this completed job?</h3>
            <p className="text-white/50 text-sm mb-6">
              This confirms the work is done to your satisfaction and marks the job as completed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowApproveModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmApproveCompletion}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClarifyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Ask contractor for verification</h3>
            <p className="text-white/50 text-sm mb-3">
              What would you like clarified about the completed work?
            </p>
            <textarea
              value={clarifyNote}
              onChange={(e) => setClarifyNote(e.target.value)}
              rows={3}
              placeholder="e.g. Can you confirm the leak under the sink was fully sealed?"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-5"
            />
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowClarifyModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitClarifyRequest}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? 'Sending...' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPriceModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">
              {priceAction === 'approve' ? 'Approve new price?' : 'Reject price change?'}
            </h3>
            <p className="text-white/50 text-sm mb-6">
              {priceAction === 'approve'
                ? 'The job total will be updated to the new amount.'
                : 'The contractor will be notified their request was declined. The original price stays in effect.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPriceModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmPriceAction}
                disabled={actioning}
                className={
                  priceAction === 'approve'
                    ? 'flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50'
                    : 'flex-1 bg-red-500/20 text-red-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-500/30 transition disabled:opacity-50'
                }
              >
                {actioning ? 'Saving...' : priceAction === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentModal && (
        <StripePaymentModal
          clientSecret={paymentModal.clientSecret}
          amount={paymentModal.amount}
          title="Pay contractor"
          onClose={() => setPaymentModal(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}