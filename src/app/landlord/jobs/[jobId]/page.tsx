'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { expectRow } from '@/lib/expectRow'
import { compressImage } from '@/lib/imageCompress'
import { validateMediaFile } from '@/lib/mediaValidation'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { PhotoGrid } from '@/components/PhotoGrid'
import { notify, notifyJobOpen } from '@/lib/notify'
import { postJobStatusMessage } from '@/lib/systemMessage'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { WrenchIcon, CheckCircleIcon, MessageCircleIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ReviewForm } from '@/components/ReviewForm'
import type { PaymentOutcome } from '@/components/StripePaymentModal'
import { PaymentTrustBadge } from '@/components/PaymentTrustBadge'
// Pulls in @stripe/react-stripe-js, only ever needed once a payment
// actually starts — most visits to a job's page are just checking
// status, not paying, so there's no reason to ship that into every
// visit's own JS chunk. (PaymentOutcome above is a type-only import,
// erased at compile time, so it costs nothing either way.)
const StripePaymentModal = dynamic(() => import('@/components/StripePaymentModal').then((m) => m.StripePaymentModal), { ssr: false })
import { RaiseDisputeButton } from '@/components/RaiseDisputeButton'
import { JobChatCard, scrollToChat } from '@/components/JobChatCard'
import { ContractorReviewsList } from '@/components/ContractorReviewsList'
import { UnreadDot } from '@/components/UnreadDot'
import { getUnreadJobIds } from '@/lib/messageReads'
import { useJobRealtime } from '@/lib/useJobRealtime'
import { requirementById } from '@/lib/credentialRequirements'
import { TIME_WINDOWS, validateScheduleTime, lateRescheduleWarning, shortNoticeWarning } from '@/lib/scheduleWindows'
import { AddressLink } from '@/components/AddressLink'
import { cardProcessingFee, achProcessingFee } from '@/lib/cardSurcharge'
import { useLanguage, t, windowLabel } from '@/lib/i18n'

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasUnread, setHasUnread] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [hasActiveTenant, setHasActiveTenant] = useState(false)
  const [photos, setPhotos] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [verifiedContractorIds, setVerifiedContractorIds] = useState<Set<string>>(new Set())
  const [unlicensedContractorIds, setUnlicensedContractorIds] = useState<Set<string>>(new Set())
  const [credentialBadges, setCredentialBadges] = useState<Record<string, string[]>>({})
  const [ratingSummaries, setRatingSummaries] = useState<Record<string, { avg_rating: number; review_count: number }>>({})
  const [expandedReviewsFor, setExpandedReviewsFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noMatchingContractorsNotice, setNoMatchingContractorsNotice] = useState(false)
  const [actioning, setActioning] = useState(false)
  const [questions, setQuestions] = useState<any[]>([])
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [answeringId, setAnsweringId] = useState<string | null>(null)

  const [showBiddingModal, setShowBiddingModal] = useState(false)
  const [showDiyModal, setShowDiyModal] = useState(false)
  const [diyUploading, setDiyUploading] = useState(false)
  const [diyNote, setDiyNote] = useState('')
  const [diyCost, setDiyCost] = useState('')
  const [diyError, setDiyError] = useState<string | null>(null)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineNote, setDeclineNote] = useState('')
  const [showSelectModal, setShowSelectModal] = useState(false)
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showClarificationModal, setShowClarificationModal] = useState(false)
  const [clarificationText, setClarificationText] = useState('')
  const [sendingClarification, setSendingClarification] = useState(false)
  const [clarificationError, setClarificationError] = useState<string | null>(null)
  const [payingContractor, setPayingContractor] = useState(false)
  const [paidBanner, setPaidBanner] = useState<PaymentOutcome | null>(null)
  const [paymentModal, setPaymentModal] = useState<{ clientSecret: string; amount: number } | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [showPaymentMethodChoice, setShowPaymentMethodChoice] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [priceAction, setPriceAction] = useState<'approve' | 'reject' | null>(null)

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleWindow, setScheduleWindow] = useState('morning')
  const [scheduleTime, setScheduleTime] = useState('')

  // A job sitting with zero bids is the single moment most likely to make a
  // landlord give up on the app entirely, per Nevin's own reasoning: a
  // landlord who checks back and sees nothing assumes the marketplace is
  // empty and never comes back. Rather than just wait on more contractors
  // to sign up, this turns the moment into the invite-your-own-contractor
  // growth loop right where the landlord is already looking.
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const handleInviteFromJob = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim() || inviteSending) return
    setInviteSending(true)
    setInviteError(null)

    const res = await fetch('/api/invite-contractor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        note: job?.category ? `I have a ${job.category} job ready for bids on Prophandld` : undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setInviteError(data.error || t('couldNotSendInvitePlain', lang))
      setInviteSending(false)
      return
    }

    setInviteSent(true)
    setInviteEmail('')
    setInviteSending(false)
  }

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
      setError(t('jobNotFound', lang))
      setLoading(false)
      return
    }

    if (jobData.status === 'pending_review' && jobData.contractor_completed_at) {
      const completedAt = new Date(jobData.contractor_completed_at).getTime()
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000
      if (Date.now() - completedAt > threeDaysMs) {
        // Server re-verifies staleness itself and sends every notification
        // this deserves (including the landlord's own "pay now" email) —
        // see autoApproveJobIfStale for why this used to just flip the
        // status locally instead.
        const res = await fetch(`/api/jobs/${jobId}/auto-approve-if-stale`, { method: 'POST' }).catch(() => null)
        const data = await res?.json().catch(() => null)
        if (data?.approved) {
          jobData.status = 'completed'
          jobData.landlord_approved_at = new Date().toISOString()
        }
      }
    }

    // The reporter, the photos and the bids don't depend on each other, so
    // they load together instead of one after another. People are looked up
    // once each (not once per photo or per bid).
    const personCache = new Map<string, Promise<any>>()
    const person = (id: string | null | undefined) => {
      if (!id) return Promise.resolve(null)
      if (!personCache.has(id)) {
        personCache.set(
          id,
          Promise.resolve(supabase.rpc('get_user_by_id', { user_id_input: id }).maybeSingle()).then((r) => r.data)
        )
      }
      return personCache.get(id)!
    }

    const loadReporter = async () => {
      const reporter = await person(jobData.reported_by)
      setJob({ ...jobData, reporter })
    }

    const loadPhotos = async () => {
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
            const [uploader, { data: signedUrlData }] = await Promise.all([
              person(photo.uploaded_by),
              supabase.storage.from('job-photos').createSignedUrl(photo.photo_url, 3600),
            ])
            return { ...photo, uploader, displayUrl: signedUrlData?.signedUrl }
          })
        )
        setPhotos(enriched)
      } else {
        setPhotos([])
      }
    }

    const loadBids = async () => {
      if (!['bidding', 'bid_selected', 'scheduled', 'in_progress', 'pending_review', 'completed', 'archived'].includes(jobData.status)) return

      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('*')
        .eq('job_id', jobId)
        .order('amount', { ascending: true })

      if (bidsError) {
        console.error('Error loading bids:', bidsError)
        return
      }
      if (!bidsData) return

      const uniqueContractorIds = Array.from(new Set(bidsData.map((b) => b.contractor_user_id)))

      const [contractors, { data: verifsData }, { data: credData }, summaries] = await Promise.all([
        Promise.all(uniqueContractorIds.map((id) => person(id))),
        supabase
          .from('contractor_verifications')
          .select('contractor_user_id, status')
          .in('contractor_user_id', uniqueContractorIds),
        // Only credentials an admin verified, and that haven't expired.
        supabase
          .from('contractor_credentials')
          .select('contractor_user_id, requirement_id, expiry')
          .eq('status', 'verified')
          .in('contractor_user_id', uniqueContractorIds),
        Promise.all(
          uniqueContractorIds.map(async (contractorId) => {
            const { data } = await supabase
              .rpc('get_contractor_rating_summary', { target_contractor_id: contractorId })
              .maybeSingle()
            return [contractorId, data as { avg_rating: number; review_count: number } | null] as const
          })
        ),
      ])

      const contractorById = new Map(uniqueContractorIds.map((id, i) => [id, contractors[i]]))
      setBids(bidsData.map((bid) => ({ ...bid, contractor: contractorById.get(bid.contractor_user_id) })))

      if (verifsData) {
        setVerifiedContractorIds(
          new Set(verifsData.filter((v) => v.status === 'verified').map((v) => v.contractor_user_id))
        )
        setUnlicensedContractorIds(
          new Set(verifsData.filter((v) => v.status === 'unlicensed').map((v) => v.contractor_user_id))
        )
      }

      const badges: Record<string, string[]> = {}
      for (const c of credData || []) {
        if (c.expiry && new Date(c.expiry + 'T00:00:00').getTime() < Date.now()) continue
        const label = requirementById(c.requirement_id)?.badge
        if (!label) continue
        ;(badges[c.contractor_user_id] ||= []).push(label)
      }
      setCredentialBadges(badges)

      const summaryMap: Record<string, { avg_rating: number; review_count: number }> = {}
      summaries.forEach(([contractorId, data]) => {
        if (data && data.review_count > 0) summaryMap[contractorId] = data
      })
      setRatingSummaries(summaryMap)
    }

    const loadQuestions = async () => {
      const { data } = await supabase
        .from('job_questions')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
      setQuestions(data || [])
    }

    // Determines whether "handle it myself" needs a schedule/access step —
    // a vacant unit has no one to coordinate with, an occupied one does.
    const loadTenancy = async () => {
      const { data } = await supabase
        .from('tenancies')
        .select('id')
        .eq('unit_id', jobData.unit_id)
        .eq('ended', false)
        .limit(1)
        .maybeSingle()
      setHasActiveTenant(!!data)
    }

    await Promise.all([loadReporter(), loadPhotos(), loadBids(), loadQuestions(), loadTenancy()])

    setLoading(false)
  }

  useEffect(() => {
    // Next's App Router reuses this same component instance across
    // navigations between two jobIds (that's why fetchJob() needs jobId as
    // a dependency at all) — so any state that isn't naturally overwritten
    // by fetchJob() itself survives a jump from one job to another and can
    // show stale UI for the new job. The inline invite card's "Invite
    // sent!" confirmation is exactly that: it used to keep showing on Job
    // B after being triggered on Job A, with no way to actually invite
    // anyone for Job B short of a hard refresh.
    setInviteEmail('')
    setInviteSending(false)
    setInviteSent(false)
    setInviteError(null)
    setLoading(true)
    setJob(null)
    fetchJob()
  }, [jobId, router])

  useJobRealtime(jobId, fetchJob)

  // A payment can be left showing "processing" if Stripe's confirmation was
  // late or never arrived. Check Stripe once per job when the page opens, so
  // the card corrects itself instead of offering a second payment.
  const syncedBidRef = useRef<string | null>(null)
  useEffect(() => {
    const bid = bids.find((b) => b.status === 'accepted')
    if (!bid || bid.payment_status !== 'processing' || syncedBidRef.current === bid.id || paymentModal) return
    syncedBidRef.current = bid.id
    fetch('/api/stripe/job-payment/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bidId: bid.id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.status === 'paid') fetchJob()
      })
      .catch(() => {})
  }, [bids, paymentModal])

  const handleDeletePhoto = async (photo: any) => {
    const { error: storageError } = await supabase.storage.from('job-photos').remove([photo.photo_url])
    if (storageError) {
      console.error('Error deleting photo from storage:', storageError)
    }

    const { error: deleteError } = await supabase.from('job_photos').delete().eq('id', photo.id)
    if (deleteError) {
      console.error('Error deleting photo record:', deleteError)
      setError(t('couldNotRemovePhoto', lang))
      return
    }

    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
  }

  const handleApproveClick = async () => {
    setActioning(true)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'approved' })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error acknowledging job:', updateError)
      setError(t('couldNotAcknowledgeJob', lang))
      setActioning(false)
      return
    }

    setActioning(false)
    setShowBiddingModal(true)
  }

  const confirmStartBidding = async () => {
    setActioning(true)
    const { error: biddingError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'bidding', bidding_opened_at: new Date().toISOString() })
      .eq('id', jobId))

    if (biddingError) {
      console.error('Error starting bidding:', biddingError)
      setError(t('acknowledgedButNoBidding', lang))
    } else {
      const result = await notifyJobOpen(jobId)
      setNoMatchingContractorsNotice(result?.sent === 0)
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

    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'declined', landlord_notes: declineNote || null })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error declining job:', updateError)
      setError(`${t('couldNotDeclineJob', lang)} ${updateError.message}`)
    } else {
      notify('job_declined', jobId)
      // Cancelling out of bidding: any still-open sealed bids need to be
      // closed out too, so a contractor's "Your bids" doesn't show a
      // "Pending" bid on a job that's actually dead. (No email to bidders
      // yet — see the note by the button; this only cleans up the data.)
      if (openBids.length > 0) {
        const { error: bidsError } = await supabase
          .from('bids')
          .update({ status: 'declined' })
          .eq('job_id', jobId)
          .eq('status', 'pending')
        if (bidsError) console.error('Error declining open bids on cancel:', bidsError)
      }
    }

    setShowDeclineModal(false)
    await fetchJob()
    setActioning(false)
  }

  const handleStartBidding = async () => {
    setActioning(true)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'bidding', bidding_opened_at: new Date().toISOString() })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error starting bidding:', updateError)
      setError(t('couldNotStartBidding', lang))
    } else {
      const result = await notifyJobOpen(jobId)
      setNoMatchingContractorsNotice(result?.sent === 0)
    }

    await fetchJob()
    setActioning(false)
  }

  // A vacant unit has no one to coordinate access with, so "handle it
  // myself" goes straight to the completion modal there. An occupied one
  // needs the same propose/confirm a time exchange a contractor job
  // already has — reused as-is below (status bid_selected/scheduled,
  // proposed_by 'landlord') rather than building a second mechanism,
  // since that section only ever keys off status, never off an actual
  // bid existing.
  const openDiyModal = async () => {
    setShowBiddingModal(false)
    if (hasActiveTenant) {
      await startDiySelfSchedule()
      return
    }
    setDiyNote('')
    setDiyCost('')
    setDiyError(null)
    setShowDiyModal(true)
  }

  const startDiySelfSchedule = async () => {
    setActioning(true)
    setError(null)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'bid_selected' })
      .eq('id', jobId)
      .in('status', ['approved', 'bidding']))

    if (updateError) {
      console.error('Error starting self-scheduled job:', updateError)
      setError(t('couldNotStartDiySchedule', lang))
      setActioning(false)
      return
    }

    if (openBids.length > 0) {
      const { error: bidsError } = await supabase
        .from('bids')
        .update({ status: 'declined' })
        .eq('job_id', jobId)
        .eq('status', 'pending')
      if (bidsError) console.error('Error declining open bids on DIY schedule start:', bidsError)
    }

    await fetchJob()
    setActioning(false)
  }

  const openDiyCompleteModal = () => {
    setDiyNote('')
    setDiyCost('')
    setDiyError(null)
    setShowDiyModal(true)
  }

  const handleDiyPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, stage: 'before' | 'after') => {
    const files = e.target.files
    if (!files || files.length === 0 || !userId) return

    for (const file of Array.from(files)) {
      const problem = validateMediaFile(file)
      if (problem) {
        setDiyError(problem)
        e.target.value = ''
        return
      }
    }

    setDiyUploading(true)
    setDiyError(null)

    for (const original of Array.from(files)) {
      const file = await compressImage(original)
      const fileExt = file.name.split('.').pop()
      const filePath = `${jobId}/${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('job-photos').upload(filePath, file)
      if (uploadError) {
        console.error('Error uploading photo:', uploadError)
        setDiyError(t('onePhotoFailedUpload', lang))
        continue
      }

      const { error: insertError } = await supabase
        .from('job_photos')
        .insert({ job_id: jobId, uploaded_by: userId, photo_url: filePath, stage })
      if (insertError) {
        console.error('Error saving photo record:', insertError)
        setDiyError(`${t('photoUploadedNotSaved', lang)} ${insertError.message}`)
      }
    }

    await fetchJob()
    setDiyUploading(false)
    e.target.value = ''
  }

  const confirmDiyComplete = async () => {
    if (afterPhotos.length === 0) {
      setDiyError(t('diyAfterPhotoRequired', lang))
      return
    }

    setActioning(true)
    setDiyError(null)

    if (diyNote.trim() || diyCost.trim()) {
      const notesParts = [diyNote.trim(), diyCost.trim() ? `Materials: $${diyCost.trim()}` : null].filter(Boolean)
      await supabase.from('jobs').update({ landlord_notes: notesParts.join(' · ') }).eq('id', jobId)
    }

    let failure: string | null = null
    try {
      const res = await fetch(`/api/jobs/${jobId}/complete-diy`, { method: 'POST' })
      if (!res.ok) failure = (await res.json()).error || t('couldNotCompleteDiy', lang)
    } catch {
      failure = t('couldNotCompleteDiy', lang)
    }

    if (failure) {
      console.error('Error completing job myself:', failure)
      setDiyError(failure)
      setActioning(false)
      return
    }

    notify('job_completed', jobId)
    if (userId) postJobStatusMessage(jobId, userId, '✓ Landlord marked this handled themselves')

    setShowDiyModal(false)
    await fetchJob()
    setActioning(false)
  }

  const handleSelectBidClick = (bidId: string) => {
    setSelectedBidId(bidId)
    setShowSelectModal(true)
  }

  const submitAnswer = async (questionId: string) => {
    const answer = (answerDrafts[questionId] || '').trim()
    if (!answer) return
    setAnsweringId(questionId)
    const { error: answerError } = await supabase
      .from('job_questions')
      .update({ answer, answered_by: userId, answered_at: new Date().toISOString() })
      .eq('id', questionId)
    if (answerError) {
      console.error('Error answering question:', answerError)
      setError(t('couldNotSendAnswer', lang))
    } else {
      setAnswerDrafts((prev) => ({ ...prev, [questionId]: '' }))
      setQuestions((prev) => prev.map((q) => q.id === questionId ? { ...q, answer, answered_at: new Date().toISOString() } : q))
    }
    setAnsweringId(null)
  }

  const confirmSelectBid = async () => {
    if (!selectedBidId) return

    setActioning(true)
    setError(null)

    // Guarding on status='pending' (not just id) is what makes this safe
    // against two concurrent accept attempts — a double-click, or two tabs
    // racing on the same job — since only the first one still finds a
    // 'pending' row to match; the second gets zero rows and expectRow
    // surfaces that as a real error instead of silently "succeeding" twice.
    const { error: selectError } = await expectRow(supabase
      .from('bids')
      .update({ status: 'accepted', selected_at: new Date().toISOString() })
      .eq('id', selectedBidId)
      .eq('status', 'pending'))

    if (selectError) {
      console.error('Error selecting bid:', selectError)
      setError(t('couldNotSelectBid', lang))
      setActioning(false)
      setShowSelectModal(false)
      return
    }

    // Not expectRow here on purpose — unlike the accept step above, zero
    // matching rows is a completely normal, expected outcome (a job with
    // only one bid total has no "other" bids to decline), not a failure.
    // expectRow treating that as an error used to log a false alarm on
    // every single-bid job, the most common case there is.
    const { error: declineOthersError } = await supabase
      .from('bids')
      .update({ status: 'declined' })
      .eq('job_id', jobId)
      .neq('id', selectedBidId)

    if (declineOthersError) {
      console.error('Error declining other bids:', declineOthersError)
    }

    const { error: jobUpdateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'bid_selected' })
      .eq('id', jobId))

    if (jobUpdateError) {
      console.error('Error updating job status:', jobUpdateError)
      setError(t('bidSelectedStatusFailed', lang))
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
      setError(t('pleasePickADate', lang))
      return
    }

    const timeError = validateScheduleTime(scheduleWindow, scheduleTime)
    if (timeError) {
      setError(timeError)
      return
    }

    setActioning(true)
    setError(null)

    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({
        proposed_date: scheduleDate,
        proposed_window: scheduleWindow,
        proposed_time: scheduleTime || null,
        proposed_by: 'landlord',
        schedule_confirmed: false,
        schedule_ask_tenant: false,
      })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error proposing schedule:', updateError)
      setError(t('couldNotProposeSchedule', lang))
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
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ schedule_ask_tenant: true })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error asking tenant to propose:', updateError)
      setError(t('couldNotSendRequest', lang))
    }

    await fetchJob()
    setActioning(false)
  }

  const confirmSchedule = async () => {
    setActioning(true)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ schedule_confirmed: true, status: 'scheduled' })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error confirming schedule:', updateError)
      setError(t('couldNotConfirmSchedule', lang))
    } else {
      // Same reasoning as schedule_proposed just above: whoever clicked
      // confirm was already looking at the screen when it happened, so
      // being notified about their own action reads as noise, not news.
      notify('schedule_confirmed', jobId, 'landlord')
    }

    await fetchJob()
    setActioning(false)
  }

  const handleArchive = async () => {
    setActioning(true)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'archived' })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error archiving job:', updateError)
      setError(t('couldNotArchiveJob', lang))
    }

    setShowArchiveModal(false)
    await fetchJob()
    setActioning(false)
  }

  const confirmApproveCompletion = async () => {
    setActioning(true)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'completed', landlord_approved_at: new Date().toISOString() })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error approving completion:', updateError)
      setError(`${t('couldNotApproveCompletion', lang)} ${updateError.message}`)
    } else {
      notify('job_completed', jobId)
      // "Payment released" doesn't belong here — approving the job and
      // the Stripe charge actually succeeding are two different events,
      // and this used to claim the second one before it happened: the
      // "Pay now" card below still shows a live, unclicked button right
      // after this message posts. The real "payment released" message
      // now posts from handlePayContractor/the payment-confirm flow,
      // once Stripe actually confirms the charge.
      if (userId) postJobStatusMessage(jobId, userId, '✓ Job approved')
    }

    setShowApproveModal(false)
    await fetchJob()
    setActioning(false)

    // Approving is the moment money is owed, so go straight to payment
    // instead of leaving a separate "Pay now" step to be found. If it can't
    // start (e.g. the contractor's payout account isn't ready), the error
    // and the Pay now button are waiting in the payment card.
    const bid = bids.find((b) => b.status === 'accepted')
    if (!updateError && bid && bid.payment_status !== 'paid' && bid.price_change_status !== 'pending') {
      const started = await handlePayContractor()
      if (!started) {
        setTimeout(() => document.getElementById('pay-contractor')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
      }
    }
  }

  // Note: this doesn't pause the 3-day auto-approve clock, which still runs
  // from contractor_completed_at regardless — a question left unanswered
  // long enough can still auto-approve. Flagged, not solved here: pausing it
  // is a separate decision about what the clock should actually mean once a
  // question is outstanding.
  const handleSendClarification = async () => {
    if (!clarificationText.trim()) return
    setSendingClarification(true)
    setClarificationError(null)

    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ clarification_note: clarificationText.trim() })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error sending clarification request:', updateError)
      setClarificationError(t('couldNotSendClarification', lang))
      setSendingClarification(false)
      return
    }

    notify('clarification_requested', jobId)
    setShowClarificationModal(false)
    setClarificationText('')
    setSendingClarification(false)
    await fetchJob()
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
      const { error: updateError } = await expectRow(supabase
        .from('bids')
        .update({
          amount: acceptedBid.proposed_amount,
          price_change_status: 'approved',
        })
        .eq('id', acceptedBid.id))

      if (updateError) {
        console.error('Error approving price change:', updateError)
        setError(t('couldNotApprovePriceChange', lang))
        setActioning(false)
        return
      }
    } else {
      const { error: updateError } = await expectRow(supabase
        .from('bids')
        .update({ price_change_status: 'rejected' })
        .eq('id', acceptedBid.id))

      if (updateError) {
        console.error('Error rejecting price change:', updateError)
        setError(t('couldNotRejectPriceChange', lang))
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

  // Opens the "how do you want to pay" choice first — same reason as
  // rent: the charge amount (and whether a processing-fee surcharge
  // applies) has to be fixed before the PaymentIntent is created, which
  // means the method has to be picked first. Returns true once the choice
  // is showing — the auto-approve flow only uses this to decide whether
  // to scroll to the Pay button, not to know the payment actually started.
  const handlePayContractor = async (): Promise<boolean> => {
    const acceptedBid = bids.find((b) => b.status === 'accepted')
    if (!acceptedBid) return false
    setPaymentError(null)
    setShowPaymentMethodChoice(true)
    return true
  }

  const startPaymentWithMethod = async (method: 'bank' | 'card') => {
    const acceptedBid = bids.find((b) => b.status === 'accepted')
    setShowPaymentMethodChoice(false)
    if (!acceptedBid) return

    setPayingContractor(true)
    setPaymentError(null)

    try {
      const res = await fetch('/api/stripe/job-payment/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bidId: acceptedBid.id, paymentMethod: method }),
      })
      const data = await res.json()
      if (data.alreadyPaid) {
        // Stripe already has this payment; the page was just behind.
        await fetchJob()
      } else if (!res.ok || !data.clientSecret) {
        setPaymentError(data.error || 'Could not start payment.')
      } else {
        setPaymentModal({ clientSecret: data.clientSecret, amount: data.amount })
      }
    } catch {
      setPaymentError('Could not start payment.')
    }
    setPayingContractor(false)
  }

  // Fires the moment Stripe confirms the payment, while the confirmation
  // screen is still showing. The webhook that marks the bid paid can land a
  // moment later, so refresh again a couple of times.
  const handlePaid = (outcome: PaymentOutcome) => {
    setPaidBanner(outcome)
    const bid = bids.find((b) => b.status === 'accepted')
    // Ask Stripe directly so the card flips to Paid now, without waiting on
    // the webhook; the timed refreshes below are just a backstop.
    const confirmed = bid
      ? fetch('/api/stripe/job-payment/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bidId: bid.id }),
        }).catch(() => null)
      : Promise.resolve(null)
    confirmed.then(() => fetchJob())
    setTimeout(fetchJob, 3000)
    setTimeout(fetchJob, 8000)
  }

  const handlePaymentSuccess = async () => {
    setPaymentModal(null)
    await fetchJob()
  }

  const statusLabel = (status: string) => {
    // A DIY job passes through bid_selected/scheduled too (reusing the same
    // propose/confirm mechanism a contractor job uses), but "Contractor
    // selected" reads as wrong when there's no contractor on it at all.
    if (status === 'bid_selected' && !acceptedBid) return t('statusDiyScheduling', lang)
    const labels: Record<string, string> = {
      pending_approval: t('statusNeedsApproval', lang),
      approved: t('statusAcknowledged', lang),
      bidding: t('statusBidding', lang),
      bid_selected: t('statusBidSelected', lang),
      scheduled: t('statusScheduledFull', lang),
      in_progress: t('statusInProgressFull', lang),
      pending_review: t('statusPendingYourReview', lang),
      completed: t('statusCompleted', lang),
      archived: t('statusArchived', lang),
      declined: t('statusDeclined', lang),
      disputed: t('statusDisputedFull', lang),
    }
    return labels[status] || status
  }

  const disputeEligible =
    job?.status === 'pending_review' ||
    (job?.status === 'completed' &&
      job?.landlord_approved_at &&
      Date.now() - new Date(job.landlord_approved_at).getTime() < 48 * 60 * 60 * 1000)

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord/jobs" className="text-white/50 hover:text-white text-sm transition">
          {t('jobsBack', lang)}
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
  // Approving a finished job hands straight over to payment when there is
  // something to pay (not already paid or clearing, and no price change
  // waiting on the landlord's answer first).
  const payOnApprove =
    !!acceptedBid &&
    acceptedBid.payment_status !== 'paid' &&
    acceptedBid.price_change_status !== 'pending'
  const payOnApproveAmount = acceptedBid ? Number(acceptedBid.amount ?? 0) : 0
  // Excludes 'declined' bids from a prior round — a job that reopened
  // after the selected contractor cancelled otherwise showed every
  // losing (and the cancelling contractor's own) bid with a live
  // "Select this contractor" button, including the one who just backed out.
  const openBids = bids.filter((b) => b.status === 'pending')
  const showSchedulingSection = ['bid_selected', 'scheduled'].includes(job.status)
  const isMyTurnToRespond = job.proposed_by && job.proposed_by !== 'landlord' && !job.schedule_confirmed
  const beforePhotos = photos.filter((p) => p.stage === 'before')
  const afterPhotos = photos.filter((p) => p.stage === 'after')
  const receiptPhotos = photos.filter((p) => p.stage === 'receipt')
  const generalPhotos = photos.filter((p) => p.stage === 'general' || !p.stage)

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord/jobs" className="text-white/50 hover:text-white text-sm transition">
          {t('jobsBack', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <a href="#chat" onClick={scrollToChat} aria-label={t('goToChat', lang)} className="relative text-white/50 hover:text-white transition">
          <MessageCircleIcon className="w-5 h-5" />
          {hasUnread && <UnreadDot className="absolute -top-0.5 -right-0.5" />}
        </a>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">

        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-2xl font-bold text-white">{job.category}</h1>
                {job.is_emergency && (
                  <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2.5 py-1 font-semibold">
                    {t('emergency', lang)}
                  </span>
                )}
              </div>
              <p className="text-white/60 text-sm">
                <AddressLink address={job.units?.properties?.address} city={job.units?.properties?.city} />
                {' '}· Unit {job.units?.unit_number}
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
                {t('archiveBtn', lang)}
              </button>
            )}
            {['approved', 'bidding'].includes(job.status) && (
              <button
                onClick={handleDeclineClick}
                disabled={actioning}
                className="text-red-400/70 hover:text-red-400 text-xs transition shrink-0 disabled:opacity-50"
              >
                {t('cancelThisJobBtn', lang)}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">
              {t('statusPrefix', lang)} <span className="text-[#12A5A9]">{statusLabel(job.status)}</span>
              {job.self_completed && (
                <span className="ml-2 text-[10px] font-semibold text-[#12A5A9] bg-[#12A5A9]/15 border border-[#12A5A9]/30 rounded-full px-2 py-0.5 align-middle">
                  {t('diySelfCompletedBadge', lang)}
                </span>
              )}
            </h2>
            {job.status === 'pending_approval' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleApproveClick}
                  disabled={actioning}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  {t('acknowledge', lang)}
                </button>
                <button
                  onClick={handleDeclineClick}
                  disabled={actioning}
                  className="text-red-400/70 hover:text-red-400 text-xs transition"
                >
                  {t('decline', lang)}
                </button>
              </div>
            )}
            {job.status === 'approved' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleStartBidding}
                  disabled={actioning}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  {t('startBidding', lang)}
                </button>
                <button
                  onClick={openDiyModal}
                  disabled={actioning}
                  className="text-white/50 hover:text-white text-xs transition disabled:opacity-50"
                >
                  {t('handleItMyselfShort', lang)}
                </button>
              </div>
            )}
            {job.status === 'pending_review' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowApproveModal(true)}
                  disabled={actioning}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  {t('approveLabel', lang)}
                </button>
                <button
                  onClick={() => scrollToChat()}
                  className="text-white/50 hover:text-white text-xs transition"
                >
                  {t('chatWithContractorLabel', lang)}
                </button>
                {!job.clarification_note && (
                  <button
                    onClick={() => setShowClarificationModal(true)}
                    className="text-white/50 hover:text-white text-xs transition"
                  >
                    {t('askAQuestionBtn', lang)}
                  </button>
                )}
              </div>
            )}
            {!acceptedBid && ['bid_selected', 'scheduled'].includes(job.status) && (
              <button
                onClick={openDiyCompleteModal}
                disabled={actioning}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {t('diyMarkFixed', lang)}
              </button>
            )}
          </div>

          <p className="text-white/70 text-sm leading-relaxed">{job.description}</p>

          {job.access_notes && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-3">
              <p className="text-white/50 text-xs font-semibold mb-1">{t('accessNotesForContractorHeading', lang)}</p>
              <p className="text-white/70 text-sm">{job.access_notes}</p>
            </div>
          )}

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
            <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-1 capitalize">
              {job.urgency} {t('urgencySuffix', lang)}
            </span>
          </div>

          <p className="text-white/50 text-xs mt-3">
            {t('reportedBy', lang)} {job.reporter?.full_name || t('unknownName', lang)} · {new Date(job.created_at).toLocaleString()}
          </p>

          {job.landlord_notes && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-3">
              <p className="text-white/50 text-xs">{t('noteLabel', lang)} {job.landlord_notes}</p>
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
            <h3 className="text-yellow-400 font-semibold mb-2">{t('verificationRequestedHeading', lang)}</h3>
            {job.clarification_note && (
              <div className="mb-3">
                <p className="text-white/60 text-xs mb-1">{t('youAskedLabel', lang)}</p>
                <p className="text-white/70 text-sm">{job.clarification_note}</p>
              </div>
            )}
            {job.clarification_response ? (
              <div>
                <p className="text-white/60 text-xs mb-1">{t('contractorRespondedLabel', lang)}</p>
                <p className="text-white/70 text-sm">{job.clarification_response}</p>
              </div>
            ) : (
              <p className="text-white/60 text-xs italic">{t('waitingOnContractorResponse', lang)}</p>
            )}
          </div>
        )}

        {job.status === 'pending_review' && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-4 mb-4">
            <p className="text-white/60 text-xs">
              ⏳ {t('autoApproveNotice', lang)}
            </p>
          </div>
        )}

        {job.status === 'disputed' && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6 mb-4">
            <h3 className="text-yellow-400 font-semibold mb-1">{t('statusDisputedFull', lang)}</h3>
            <p className="text-white/60 text-sm">
              {t('disputeReviewDesc', lang)}
            </p>
          </div>
        )}

        {disputeEligible && (
          <div className="mb-4">
            <RaiseDisputeButton jobId={jobId} onRaised={fetchJob} />
          </div>
        )}

        {job.status === 'bidding' && questions.length > 0 && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-1">{t('questionsFromContractors', lang)}</h3>
            <p className="text-white/50 text-xs mb-4">{t('answerVisibleToAll', lang)}</p>
            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white/80 text-sm mb-2">{q.question}</p>
                  {q.answer ? (
                    <p className="text-[#12A5A9] text-sm">
                      <span className="text-[#12A5A9]/60">{t('yourAnswerLabel', lang)}</span> {q.answer}
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={answerDrafts[q.id] || ''}
                        onChange={(e) => setAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={t('typeYourAnswer', lang)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
                      />
                      <button
                        onClick={() => submitAnswer(q.id)}
                        disabled={answeringId === q.id || !(answerDrafts[q.id] || '').trim()}
                        className="bg-white/8 text-white text-sm font-semibold px-4 rounded-lg hover:bg-white/12 transition disabled:opacity-40 shrink-0"
                      >
                        {answeringId === q.id ? '...' : t('answerBtn', lang)}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollReveal>
        )}

        {job.status === 'bidding' && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">
              {t('sealedBidsHeading', lang)} {openBids.length > 0 && `(${openBids.length})`}
            </h3>
            {noMatchingContractorsNotice && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-3">
                <p className="text-yellow-400 text-sm">{t('noContractorsMatchedNotice', lang)}</p>
              </div>
            )}
            {openBids.length === 0 ? (
              <div>
                <p className="text-white/50 text-sm mb-4">{t('noBidsYetNotified', lang)}</p>
                <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#0A7B7E]/30 to-[#12A5A9]/30 border border-[#12A5A9]/30 flex items-center justify-center shrink-0">
                      <WrenchIcon className="w-4 h-4 text-[#12A5A9]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{t('jobInviteHeading', lang)}</p>
                      <p className="text-white/50 text-xs mt-0.5 mb-3">{t('jobInviteDesc', lang)}</p>
                      {inviteSent ? (
                        <div className="flex items-center gap-2 text-[#12A5A9] text-sm font-medium">
                          <CheckCircleIcon className="w-4 h-4 shrink-0" />
                          {t('inviteCardSent', lang)}
                        </div>
                      ) : (
                        <form onSubmit={handleInviteFromJob} className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            required
                            placeholder={t('contractorsEmailPlaceholder', lang)}
                            className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
                          />
                          <RippleButton
                            type="submit"
                            disabled={inviteSending}
                            className="text-sm font-semibold bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 shrink-0"
                          >
                            {inviteSending ? t('sendingDots', lang) : t('inviteCardSendBtn', lang)}
                          </RippleButton>
                        </form>
                      )}
                      {inviteError && <p className="text-red-400 text-xs mt-2">{inviteError}</p>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={openDiyModal}
                  disabled={actioning}
                  className="text-white/50 hover:text-white text-xs mt-3 transition disabled:opacity-50"
                >
                  {t('handleItMyself', lang)}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {openBids.map((bid) => (
                  <div key={bid.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold">{bid.contractor?.full_name || t('unknownContractor', lang)}</p>
                        {(credentialBadges[bid.contractor_user_id] || []).map((label) => (
                          <span key={label} className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">
                            {label} ✓
                          </span>
                        ))}
                        {verifiedContractorIds.has(bid.contractor_user_id) && !credentialBadges[bid.contractor_user_id]?.length && (
                          <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">
                            {t('verifiedStatus', lang)}
                          </span>
                        )}
                        {unlicensedContractorIds.has(bid.contractor_user_id) && !credentialBadges[bid.contractor_user_id]?.length && (
                          <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5 font-semibold">
                            {t('noLicenseOnFile', lang)}
                          </span>
                        )}
                        {ratingSummaries[bid.contractor_user_id] && (
                          <button
                            type="button"
                            onClick={() => setExpandedReviewsFor(expandedReviewsFor === bid.contractor_user_id ? null : bid.contractor_user_id)}
                            className="text-xs bg-white/8 text-white/60 rounded-full px-2 py-0.5 font-semibold hover:bg-white/12 transition"
                          >
                            ★ {ratingSummaries[bid.contractor_user_id].avg_rating.toFixed(1)} ({ratingSummaries[bid.contractor_user_id].review_count})
                          </button>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[#12A5A9] font-bold">${bid.amount}</p>
                        {bid.pricing_type === 'hourly' && bid.labor_rate && (
                          <p className="text-white/40 text-[11px]">${bid.labor_rate}/hr</p>
                        )}
                      </div>
                    </div>
                    {bid.availability && <p className="text-white/50 text-xs">{t('availabilityColonLabel', lang)} {bid.availability}</p>}
                    {bid.estimated_hours && <p className="text-white/50 text-xs">{t('estHoursColonLabel', lang)} {bid.estimated_hours}</p>}
                    {bid.notes && <p className="text-white/60 text-xs mt-1 italic">{bid.notes}</p>}
                    {bid.not_included && (
                      <p className="text-yellow-400/80 text-xs mt-1">{t('notIncludedColonLabel', lang)} {bid.not_included}</p>
                    )}
                    {expandedReviewsFor === bid.contractor_user_id && (
                      <div className="mt-3">
                        <ContractorReviewsList contractorUserId={bid.contractor_user_id} />
                      </div>
                    )}
                    <RippleButton
                      onClick={() => handleSelectBidClick(bid.id)}
                      disabled={actioning}
                      className="mt-3 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      {t('selectThisContractorBtn', lang)}
                    </RippleButton>
                  </div>
                ))}
              </div>
            )}
          </ScrollReveal>
        )}

        {['bid_selected', 'scheduled', 'in_progress', 'pending_review', 'completed', 'archived'].includes(job.status) && acceptedBid && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-3">{t('selectedContractorHeading', lang)}</h3>
            {acceptedBid && (
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold">{acceptedBid.contractor?.full_name}</p>
                  {(credentialBadges[acceptedBid.contractor_user_id] || []).map((label) => (
                    <span key={label} className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">
                      {label} ✓
                    </span>
                  ))}
                  {verifiedContractorIds.has(acceptedBid.contractor_user_id) && !credentialBadges[acceptedBid.contractor_user_id]?.length && (
                    <span className="text-xs bg-[#0A7B7E]/20 text-[#12A5A9] rounded-full px-2 py-0.5 font-semibold">
                      {t('verifiedStatus', lang)}
                    </span>
                  )}
                  {unlicensedContractorIds.has(acceptedBid.contractor_user_id) && !credentialBadges[acceptedBid.contractor_user_id]?.length && (
                    <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5 font-semibold">
                      {t('noLicenseOnFile', lang)}
                    </span>
                  )}
                  {ratingSummaries[acceptedBid.contractor_user_id] && (
                    <button
                      type="button"
                      onClick={() => setExpandedReviewsFor(expandedReviewsFor === acceptedBid.contractor_user_id ? null : acceptedBid.contractor_user_id)}
                      className="text-xs bg-white/8 text-white/60 rounded-full px-2 py-0.5 font-semibold hover:bg-white/12 transition"
                    >
                      ★ {ratingSummaries[acceptedBid.contractor_user_id].avg_rating.toFixed(1)} ({ratingSummaries[acceptedBid.contractor_user_id].review_count})
                    </button>
                  )}
                </div>
                {expandedReviewsFor === acceptedBid.contractor_user_id && (
                  <div className="mt-3">
                    <ContractorReviewsList contractorUserId={acceptedBid.contractor_user_id} />
                  </div>
                )}
                {acceptedBid.price_change_status === 'pending' ? (
  <div className="mt-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
    <p className="text-yellow-400 text-xs font-semibold mb-1">{t('priceChangeRequestedLabel', lang)}</p>
    <p className="text-white/60 text-sm line-through">${acceptedBid.amount}</p>
    <p className="text-white font-bold text-lg">${acceptedBid.proposed_amount}</p>
    {(acceptedBid.price_change_labor || acceptedBid.price_change_parts) && (
      <div className="text-white/50 text-xs mt-2 space-y-0.5">
        {acceptedBid.price_change_labor && <p>{t('laborColonLabel', lang)} ${acceptedBid.price_change_labor}</p>}
        {acceptedBid.price_change_parts && <p>{t('partsColonLabel', lang)} ${acceptedBid.price_change_parts}</p>}
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
                        {t('approveNewPriceBtn', lang)}
                      </button>
                      <button
                        onClick={() => openPriceModal('reject')}
                        disabled={actioning}
                        className="text-red-400/70 hover:text-red-400 text-xs transition"
                      >
                        {t('rejectBtn', lang)}
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
                {acceptedBid.availability && <p className="text-white/50 text-xs mt-1">{t('availabilityColonLabel', lang)} {acceptedBid.availability}</p>}
              </div>
            )}
          </div>
        )}

        {['completed', 'archived'].includes(job.status) && acceptedBid && (
          <div id="pay-contractor" className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4 scroll-mt-24">
            {paidBanner && (
              <div
                role="status"
                className={`flex items-start gap-3 rounded-xl px-4 py-3 mb-5 border motion-safe:animate-[fadeIn_0.4s_ease-out] ${
                  paidBanner === 'succeeded'
                    ? 'bg-[#0A7B7E]/15 border-[#12A5A9]/30'
                    : 'bg-yellow-500/10 border-yellow-500/25'
                }`}
              >
                <CheckCircleIcon className={`w-5 h-5 shrink-0 mt-0.5 ${paidBanner === 'succeeded' ? 'text-[#12A5A9]' : 'text-yellow-400'}`} />
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold">
                    {paidBanner === 'succeeded' ? t('paymentCompleteLabel', lang) : t('paymentOnWayLabel', lang)}
                  </p>
                  <p className="text-white/60 text-xs mt-0.5">
                    {paidBanner === 'succeeded'
                      ? `$${payOnApproveAmount} ${t('sentTo', lang).toLowerCase()} ${acceptedBid.contractor?.full_name || t('toContractorFallback', lang)}. ${t('receiptReadyBelow', lang)}`
                      : t('bankPaymentStartedDesc', lang)}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">{t('payContractorHeading', lang)}</h3>
                <p className="text-white/60 text-sm mt-1">
                  ${acceptedBid.amount}{' '}
                  {(acceptedBid.payment_status === 'paid' || paidBanner === 'succeeded' ? t('sentTo', lang) : t('owedTo', lang)).toLowerCase()}{' '}
                  {acceptedBid.contractor?.full_name}
                </p>
              </div>
              {paidBanner === 'processing' && acceptedBid.payment_status !== 'paid' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400">
                  {t('processing', lang)}
                </span>
              ) : acceptedBid.payment_status === 'paid' || paidBanner === 'succeeded' ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]">
                    <CheckCircleIcon className="w-3 h-3" /> {t('paidLabel', lang)}
                  </span>
                  <Link href={`/receipts/job/${acceptedBid.id}`} className="text-[#12A5A9] text-xs font-semibold hover:underline">
                    {t('receipt', lang)}
                  </Link>
                </div>
              ) : (
                <RippleButton
                  onClick={handlePayContractor}
                  disabled={payingContractor}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 shrink-0"
                >
                  {payingContractor ? t('loadingShort', lang) : t('payNowBtn', lang)}
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
            <h3 className="text-white font-semibold mb-4">{t('scheduleHeading', lang)}</h3>

            {!job.proposed_date ? (
              <div className="text-center py-4">
                <p className="text-white/50 text-sm mb-4">{t('noAppointmentProposedYet', lang)}</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={openScheduleModal}
                    className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition"
                  >
                    {t('proposeATimeMyself', lang)}
                  </button>
                  <button
                    onClick={askTenantToPropose}
                    disabled={actioning || job.schedule_ask_tenant}
                    className="bg-white/8 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-white/12 transition disabled:opacity-50"
                  >
                    {job.schedule_ask_tenant ? t('waitingOnTenantDots', lang) : t('letTenantPickTime', lang)}
                  </button>
                </div>
              </div>
            ) : job.schedule_confirmed ? (
              <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3">
                <p className="text-[#12A5A9] text-sm font-medium flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4" /> {t('confirmedState', lang)}
                </p>
                <p className="text-white text-sm mt-1">
                  {new Date(job.proposed_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {windowLabel(job.proposed_window, lang)}
                  {job.proposed_time && ` · ${job.proposed_time}`}
                </p>
                <button
                  onClick={openScheduleModal}
                  disabled={actioning}
                  className="text-white/50 text-xs hover:text-white transition mt-2"
                >
                  {t('rescheduleBtn', lang)}
                </button>
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                <p className="text-yellow-400/80 text-xs mb-1">
                  {t('proposedByLabel', lang)} {job.proposed_by === 'landlord' ? t('you', lang) : job.proposed_by}
                </p>
                <p className="text-white text-sm">
                  {new Date(job.proposed_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {windowLabel(job.proposed_window, lang)}
                  {job.proposed_time && ` · ${job.proposed_time}`}
                </p>
                {shortNoticeWarning(job.proposed_date, job.proposed_window, job.proposed_time, job.is_emergency) && (
                  <p className="text-yellow-400/70 text-xs mt-2 leading-relaxed">{shortNoticeWarning(job.proposed_date, job.proposed_window, job.proposed_time, job.is_emergency)}</p>
                )}
                {isMyTurnToRespond ? (
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={confirmSchedule}
                      disabled={actioning}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      {t('confirmThisTime', lang)}
                    </button>
                    <button
                      onClick={openScheduleModal}
                      disabled={actioning}
                      className="text-white/50 text-xs hover:text-white transition"
                    >
                      {t('proposeDifferentTime', lang)}
                    </button>
                  </div>
                ) : (
                  <p className="text-white/60 text-xs mt-3">{t(acceptedBid ? 'waitingOnContractorOrTenant' : 'waitingOnTenantOnly', lang)}</p>
                )}
              </div>
            )}
          </div>
        )}

        {['in_progress', 'pending_review', 'completed', 'archived'].includes(job.status) && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">{t('proofOfWorkHeading', lang)}</h3>
            <div className="mb-5">
              <p className="text-white/70 text-sm font-medium mb-2">{t('beforeLabel', lang)} ({beforePhotos.length})</p>
              {beforePhotos.length === 0 ? (
                <p className="text-white/50 text-xs">{t('noBeforePhotosYet', lang)}</p>
              ) : (
                <PhotoGrid photos={beforePhotos} columns={3} />
              )}
            </div>
            <div>
              <p className="text-white/70 text-sm font-medium mb-2">{t('afterLabel', lang)} ({afterPhotos.length})</p>
              {afterPhotos.length === 0 ? (
                job.status === 'pending_review' ? (
                  <p className="text-yellow-400 text-xs">
                    {t('noAfterPhotosPendingReview', lang)}
                  </p>
                ) : (
                  <p className="text-white/50 text-xs">{t('noAfterPhotosYet', lang)}</p>
                )
              ) : (
                <PhotoGrid photos={afterPhotos} columns={3} />
              )}
            </div>
            {receiptPhotos.length > 0 && (
              <div className="mt-5">
                <p className="text-white/70 text-sm font-medium mb-2">{t('materialReceiptsLabel', lang)} ({receiptPhotos.length})</p>
                <PhotoGrid photos={receiptPhotos} columns={3} />
              </div>
            )}
          </div>
        )}

        <div>
          <h3 className="text-white font-semibold mb-3">
            {t('reportedPhotosHeading', lang)} {generalPhotos.length > 0 && `(${generalPhotos.length})`}
          </h3>
          {generalPhotos.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
              <p className="text-white/50 text-sm">{t('noPhotosAttached', lang)}</p>
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

        {userId && (
          <JobChatCard
            jobId={jobId}
            title={acceptedBid ? t('chatWithContractorLabel', lang) : t('jobChatTitle', lang)}
            subtitle={
              acceptedBid
                ? `${acceptedBid.contractor?.full_name || t('yourContractorFallback', lang)} · ${t('jobChatSubtitleWithContractor', lang)}`
                : t('jobChatSubtitleGeneric', lang)
            }
            onRead={() => setHasUnread(false)}
          />
        )}
      </main>

      {showBiddingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" /> {t('jobAcknowledged', lang)}
            </h3>
            <p className="text-white/50 text-sm mb-6">
              {t('letContractorsBid', lang)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={skipBidding}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('notYet', lang)}
              </button>
              <button
                onClick={confirmStartBidding}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? t('starting', lang) : t('startBidding', lang)}
              </button>
            </div>
            <button
              onClick={openDiyModal}
              disabled={actioning}
              className="w-full text-white/50 hover:text-white text-xs mt-4 transition disabled:opacity-50"
            >
              {t('handleItMyself', lang)}
            </button>
          </div>
        </div>
      )}

      {showDiyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20 py-10 overflow-y-auto">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full my-auto">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-1.5">
              <WrenchIcon className="w-4 h-4 text-[#12A5A9]" /> {t('diyModalHeading', lang)}
            </h3>
            <p className="text-white/50 text-sm mb-2">{t('diyModalDesc', lang)}</p>
            <p className="text-white/40 text-xs mb-5">{t('videoLengthHint', lang)}</p>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-xs font-medium">{t('afterLabel', lang)} ({afterPhotos.length})</p>
                <label>
                  <input type="file" accept="image/*,video/*" multiple onChange={(e) => handleDiyPhotoUpload(e, 'after')} className="hidden" />
                  <span className="text-[#12A5A9] text-xs hover:underline cursor-pointer">{t('addPhotosLink', lang)}</span>
                </label>
              </div>
              {afterPhotos.length > 0 && <PhotoGrid photos={afterPhotos} columns={4} />}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-xs font-medium">{t('beforeLabel', lang)} ({beforePhotos.length})</p>
                <label>
                  <input type="file" accept="image/*,video/*" multiple onChange={(e) => handleDiyPhotoUpload(e, 'before')} className="hidden" />
                  <span className="text-[#12A5A9] text-xs hover:underline cursor-pointer">{t('addPhotosLink', lang)}</span>
                </label>
              </div>
              {beforePhotos.length > 0 && <PhotoGrid photos={beforePhotos} columns={4} />}
            </div>

            <textarea
              value={diyNote}
              onChange={(e) => setDiyNote(e.target.value)}
              placeholder={t('diyNotePlaceholder', lang)}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition mb-3 resize-none"
            />

            <div className="mb-4">
              <label className="text-white/50 text-xs block mb-1">{t('diyCostLabel', lang)}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={diyCost}
                onChange={(e) => setDiyCost(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            {diyError && <p className="text-red-400 text-xs mb-3">{diyError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setShowDiyModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
              </button>
              <button
                onClick={confirmDiyComplete}
                disabled={actioning || diyUploading}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? t('diyMarkingFixed', lang) : t('diyMarkFixed', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeclineModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">
              {job.status === 'pending_approval' ? t('declineThisJob', lang) : t('cancelThisJobQ', lang)}
            </h3>
            <p className="text-white/50 text-sm mb-3">
              {t('optionallyLetRenterKnow', lang)}
            </p>
            {openBids.length > 0 && (
              <p className="text-yellow-400/90 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 mb-3">
                {openBids.length === 1 ? t('bidderWarningOne', lang) : `${openBids.length} ${t('bidderWarningMany', lang)}`} {t('bidderWarningRest', lang)}
              </p>
            )}
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              rows={3}
              placeholder={t('declineNotePlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-5"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeclineModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('neverMind', lang)}
              </button>
              <button
                onClick={confirmDecline}
                disabled={actioning}
                className="flex-1 bg-red-500/20 text-red-400 text-sm font-semibold py-2.5 rounded-xl hover:bg-red-500/30 transition disabled:opacity-50"
              >
                {actioning ? t('cancellingDots', lang) : job.status === 'pending_approval' ? t('decline', lang) : t('cancelJobBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSelectModal && selectedBid && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">{t('selectThisContractorQ', lang)}</h3>
            <p className="text-white/50 text-sm mb-4">
              <span className="text-white font-medium">{selectedBid.contractor?.full_name}</span> {t('forLabel', lang)}{' '}
              <span className="text-[#12A5A9] font-semibold">${selectedBid.amount}</span>. {t('allOtherBidsNotSelected', lang)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSelectModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
              </button>
              <RippleButton
                onClick={confirmSelectBid}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? t('selecting', lang) : t('confirmBtn', lang)}
              </RippleButton>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-4">{t('proposeATimeHeading', lang)}</h3>

            {job.schedule_confirmed && job.proposed_date && lateRescheduleWarning(job.proposed_date) && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-yellow-400/90 text-xs leading-relaxed">{lateRescheduleWarning(job.proposed_date)}</p>
              </div>
            )}

            {shortNoticeWarning(scheduleDate, scheduleWindow, scheduleTime, job.is_emergency) && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-yellow-400/90 text-xs leading-relaxed">{shortNoticeWarning(scheduleDate, scheduleWindow, scheduleTime, job.is_emergency)}</p>
              </div>
            )}

            {job.tenant_availability && job.tenant_availability.length > 0 && (
              <div className="mb-4">
                <p className="text-white/50 text-xs mb-2">{t('tenantSaidFree', lang)}</p>
                <div className="flex flex-wrap gap-2">
                  {job.tenant_availability.map((slot: { date: string; window: string }, i: number) => {
                    const label = windowLabel(slot.window, lang)
                    const active = scheduleDate === slot.date && scheduleWindow === slot.window
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setScheduleDate(slot.date); setScheduleWindow(slot.window) }}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                          active
                            ? 'bg-[#12A5A9]/20 border-[#12A5A9] text-[#12A5A9]'
                            : 'bg-white/5 border-white/10 text-white/70 hover:border-[#12A5A9]/40'
                        }`}
                      >
                        {new Date(slot.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <label className="text-white/70 text-sm block mb-1">{t('dateLabel', lang)}</label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition mb-4"
            />

            <label className="text-white/70 text-sm block mb-1">{t('timeWindowLabel', lang)}</label>
            <select
              value={scheduleWindow}
              onChange={(e) => setScheduleWindow(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition mb-4"
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w.value} value={w.value} className="bg-[#0C1A2E]">{windowLabel(w.value, lang)}</option>
              ))}
            </select>

            <label className="text-white/70 text-sm block mb-1">{t('specificTimeOptional', lang)}</label>
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
                {t('cancel', lang)}
              </button>
              <button
                onClick={submitProposal}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? t('proposing', lang) : t('proposeBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchiveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">{t('archiveThisJobQ', lang)}</h3>
            <p className="text-white/50 text-sm mb-6">
              {t('archiveJobDesc', lang)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowArchiveModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
              </button>
              <button
                onClick={handleArchive}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? t('archiving', lang) : t('archiveBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showApproveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">{t('approveCompletedJobQ', lang)}</h3>
            <p className="text-white/50 text-sm mb-6">
              {payOnApprove
                ? `${t('approveDescPay', lang)} $${payOnApproveAmount} ${t('sentTo', lang).toLowerCase()} ${acceptedBid?.contractor?.full_name || t('toContractorFallback', lang)}.`
                : t('approveDescPlain', lang)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowApproveModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
              </button>
              <button
                onClick={confirmApproveCompletion}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? t('approving', lang) : payOnApprove ? t('approveAndPayBtn', lang) : t('approveLabel', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClarificationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">{t('askAQuestionHeading', lang)}</h3>
            <p className="text-white/50 text-sm mb-4">{t('askAQuestionDesc', lang)}</p>
            <textarea
              value={clarificationText}
              onChange={(e) => setClarificationText(e.target.value)}
              rows={3}
              placeholder={t('askAQuestionPlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-3"
            />
            {clarificationError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-3">
                {clarificationError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowClarificationModal(false); setClarificationText(''); setClarificationError(null) }}
                disabled={sendingClarification}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
              </button>
              <button
                onClick={handleSendClarification}
                disabled={sendingClarification || !clarificationText.trim()}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {sendingClarification ? t('sendingDots', lang) : t('sendQuestionBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPriceModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">
              {priceAction === 'approve' ? t('approveNewPriceQ', lang) : t('rejectPriceChangeQ', lang)}
            </h3>
            <p className="text-white/50 text-sm mb-6">
              {priceAction === 'approve'
                ? t('priceApproveDesc', lang)
                : t('priceRejectDesc', lang)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPriceModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
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
                {actioning ? t('saving', lang) : priceAction === 'approve' ? t('approveLabel', lang) : t('rejectBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentMethodChoice && acceptedBid && (() => {
        const baseAmount = Number(acceptedBid.amount)
        const cardFee = cardProcessingFee(baseAmount)
        const bankFee = achProcessingFee(baseAmount)
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
            <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-white font-semibold mb-1">{t('howDoYouWantToPay', lang)}</h3>
              <p className="text-white/50 text-xs mb-4">{acceptedBid.contractor?.full_name} keeps ${baseAmount.toFixed(2)} either way, the fee below is Stripe's processing cost, not a Prophandld charge.</p>
              <div className="space-y-3">
                <button
                  onClick={() => startPaymentWithMethod('bank')}
                  className="w-full text-left bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl px-4 py-3 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium text-sm">{t('bankAccountOptionLabel', lang)}</span>
                    <span className="text-white font-semibold text-sm tabular-nums">${(baseAmount + bankFee).toFixed(2)}</span>
                  </div>
                  <p className="text-white/50 text-xs mt-1">
                    +${bankFee.toFixed(2)} {t('processingFeeSuffix', lang)} · {t('bankAccountOptionDescJobPay', lang)}
                  </p>
                </button>
                <button
                  onClick={() => startPaymentWithMethod('card')}
                  className="w-full text-left bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl px-4 py-3 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium text-sm">{t('debitCardOptionLabel', lang)}</span>
                    <span className="text-white font-semibold text-sm tabular-nums">${(baseAmount + cardFee).toFixed(2)}</span>
                  </div>
                  <p className="text-white/50 text-xs mt-1">
                    +${cardFee.toFixed(2)} {t('processingFeeSuffix', lang)}
                  </p>
                </button>
              </div>
              <button
                onClick={() => setShowPaymentMethodChoice(false)}
                className="w-full text-center text-white/50 hover:text-white text-sm mt-4 mb-3 transition"
              >
                {t('cancel', lang)}
              </button>
              <PaymentTrustBadge provider="stripe" />
            </div>
          </div>
        )
      })()}

      {paymentModal && (
        <StripePaymentModal
          clientSecret={paymentModal.clientSecret}
          amount={paymentModal.amount}
          title={t('payContractorHeading', lang)}
          successMessage={
            acceptedBid?.contractor?.full_name
              ? `${t('sentTo', lang)} ${acceptedBid.contractor.full_name}. ${t('receiptSavedOnJob', lang)}`
              : undefined
          }
          onClose={() => setPaymentModal(null)}
          onPaid={handlePaid}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}