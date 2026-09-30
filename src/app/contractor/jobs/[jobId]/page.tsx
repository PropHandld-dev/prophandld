'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { expectRow } from '@/lib/expectRow'
import { compressImage } from '@/lib/imageCompress'
import { validateMediaFile } from '@/lib/mediaValidation'
import { validateFileSize, MAX_MEDIA_FILE_SIZE } from '@/lib/fileUpload'
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
import { AddressLink } from '@/components/AddressLink'
import { StreetView } from '@/components/StreetView'
import { RaiseDisputeButton } from '@/components/RaiseDisputeButton'
import { JobChatCard, scrollToChat } from '@/components/JobChatCard'
import { JobProcessGuide } from '@/components/JobProcessGuide'
import { UnreadDot } from '@/components/UnreadDot'
import { getUnreadJobIds } from '@/lib/messageReads'
import { useJobRealtime } from '@/lib/useJobRealtime'
import { CONTRACTOR_TABS } from '@/lib/navTabs'
import { TIME_WINDOWS, validateScheduleTime, lateRescheduleWarning } from '@/lib/scheduleWindows'
import { useLanguage, t, windowLabel } from '@/lib/i18n'

export default function ContractorJobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasUnread, setHasUnread] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [myBid, setMyBid] = useState<any>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actioning, setActioning] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleWindow, setScheduleWindow] = useState('morning')
  const [scheduleTime, setScheduleTime] = useState('')

  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [showResponseSentModal, setShowResponseSentModal] = useState(false)

  const [showPriceChangeModal, setShowPriceChangeModal] = useState(false)
  const [laborAmount, setLaborAmount] = useState('')
  const [partsAmount, setPartsAmount] = useState('')
  const [priceChangeReason, setPriceChangeReason] = useState('')

  const fetchJob = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }
    setUserId(user.id)
    getUnreadJobIds([jobId], user.id).then((unread) => setHasUnread(unread.has(jobId)))

    // Job, this contractor's bid and the photo list don't depend on each
    // other, so they load together instead of one after another.
    const [{ data: jobData, error: jobError }, { data: bidData }, { data: photosData }] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, units(unit_number, properties(address, city, state)), maintenance_items(name, item_type, brand, model, install_date)')
        .eq('id', jobId)
        .maybeSingle(),
      supabase
        .from('bids')
        .select('*')
        .eq('job_id', jobId)
        .eq('contractor_user_id', user.id)
        .maybeSingle(),
      supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),
    ])

    if (jobError || !jobData) {
      console.error('Error loading job:', jobError)
      setError(t('jobNotFoundAccessible', lang))
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

    setJob(jobData)
    setResponseText(jobData.clarification_response || '')

    setMyBid(bidData)

    if (photosData && photosData.length > 0) {
      // One batched request for every photo link instead of one per photo.
      const { data: signed } = await supabase.storage
        .from('job-photos')
        .createSignedUrls(photosData.map((p) => p.photo_url), 3600)
      const urlByPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]))
      setPhotos(photosData.map((photo) => ({ ...photo, displayUrl: urlByPath.get(photo.photo_url) })))
    } else {
      setPhotos([])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchJob()
  }, [jobId, router])

  useJobRealtime(jobId, fetchJob)

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
        proposed_by: 'contractor',
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

    notify('schedule_proposed', jobId, 'contractor')
    setShowScheduleModal(false)
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
      notify('schedule_confirmed', jobId, 'contractor')
      if (userId) postJobStatusMessage(jobId, userId, '✓ Schedule confirmed')
    }

    await fetchJob()
    setActioning(false)
  }

  const handleCancelJob = async () => {
    if (!myBid) return
    if (!window.confirm(t('cancelJobConfirm', lang))) return

    setActioning(true)
    setError(null)

    // Done on the server so the job reopens and the bid is declined together.
    try {
      const res = await fetch('/api/contractor/cancel-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('couldNotCancelRetry', lang))
        setActioning(false)
        return
      }
    } catch {
      setError(t('couldNotCancelRetry', lang))
      setActioning(false)
      return
    }

    notify('contractor_cancelled', jobId, 'contractor')
    await fetchJob()
    setActioning(false)
  }

  const handleStartJob = async () => {
    setActioning(true)
    setError(null)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ status: 'in_progress' })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error starting job:', updateError)
      setError(t('couldNotStartJob', lang))
      setActioning(false)
      return
    }

    // Updates local state directly instead of re-fetching the whole job —
    // the write already succeeded, so there's nothing a re-fetch could
    // tell us that we don't already know, and it removed a flash of
    // "Job not found or not accessible" some contractors hit here from
    // fetchJob()'s own query racing right behind this write.
    setJob((prev: any) => (prev ? { ...prev, status: 'in_progress' } : prev))
    setActioning(false)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, stage: 'before' | 'after' | 'receipt') => {
    const files = e.target.files
    if (!files || files.length === 0 || !userId) return

    for (const file of Array.from(files)) {
      const sizeProblem = validateFileSize(file, MAX_MEDIA_FILE_SIZE)
      if (sizeProblem) {
        setError(sizeProblem)
        e.target.value = ''
        return
      }
      const problem = validateMediaFile(file)
      if (problem) {
        setError(problem)
        e.target.value = ''
        return
      }
    }

    setUploading(true)
    setError(null)

    for (const original of Array.from(files)) {
      const file = await compressImage(original)
      const fileExt = file.name.split('.').pop()
      const filePath = `${jobId}/${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Error uploading photo:', uploadError)
        setError(t('onePhotoFailedUpload', lang))
        continue
      }

      // The database can be slow under load and cancel the insert with a
      // statement timeout. Retry a couple of times, checking first whether
      // an earlier attempt actually landed so a photo is never saved twice.
      let insertError: { message: string } | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1500 * attempt))
          const { data: existing } = await supabase
            .from('job_photos')
            .select('id')
            .eq('photo_url', filePath)
            .maybeSingle()
          if (existing) {
            insertError = null
            break
          }
        }
        const { error } = await supabase
          .from('job_photos')
          .insert({
            job_id: jobId,
            uploaded_by: userId,
            photo_url: filePath,
            stage,
          })
        insertError = error
        if (!error) break
      }

      if (insertError) {
        console.error('Error saving photo record:', insertError)
        setError(`${t('photoUploadedNotSaved', lang)} ${insertError.message}`)
      }
    }

    await fetchJob()
    setUploading(false)
    e.target.value = ''
  }

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

  const openCompleteModal = () => {
    // Proof of work: at least one "after" photo. Before photos are optional
    // (an emergency job may start before anyone takes a picture). The server
    // checks this again, so it cannot be skipped.
    const afterCount = photos.filter((p) => p.stage === 'after').length

    if (afterCount === 0) {
      setError(t('addAfterPhotoBeforeComplete', lang))
      return
    }

    setError(null)
    setShowCompleteModal(true)
  }

  const confirmMarkComplete = async () => {
    setActioning(true)
    let failure: string | null = null
    try {
      const res = await fetch('/api/contractor/complete-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      if (!res.ok) failure = (await res.json()).error || t('couldNotMarkComplete', lang)
    } catch {
      failure = t('couldNotMarkComplete', lang)
    }

    if (failure) {
      console.error('Error marking job complete:', failure)
      setError(failure)
      setActioning(false)
      setShowCompleteModal(false)
      return
    }

    notify('job_pending_review', jobId)
    if (userId) postJobStatusMessage(jobId, userId, '✓ Work marked complete, awaiting landlord review')

    router.push('/contractor')
  }

  const submitResponse = async () => {
    setActioning(true)
    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({ clarification_response: responseText })
      .eq('id', jobId))

    if (updateError) {
      console.error('Error sending response:', updateError)
      setError(t('couldNotSendResponse', lang))
      setActioning(false)
      return
    }

    notify('clarification_responded', jobId)
    await fetchJob()
    setActioning(false)
    setShowResponseSentModal(true)
  }

  const openPriceChangeModal = () => {
    setLaborAmount('')
    setPartsAmount('')
    setPriceChangeReason('')
    setShowPriceChangeModal(true)
  }

  const submitPriceChange = async () => {
    const labor = parseFloat(laborAmount) || 0
    const parts = parseFloat(partsAmount) || 0
    const newTotal = labor + parts

    if (newTotal <= 0) {
      setError(t('enterLaborCost', lang))
      return
    }
    if (!priceChangeReason.trim()) {
      setError(t('explainPriceChangeReason', lang))
      return
    }

    setActioning(true)
    setError(null)

    const { error: updateError } = await expectRow(supabase
      .from('bids')
      .update({
        proposed_amount: newTotal,
        price_change_labor: labor,
        price_change_parts: parts || null,
        price_change_reason: priceChangeReason,
        price_change_status: 'pending',
      })
      .eq('id', myBid.id))

    if (updateError) {
      console.error('Error requesting price change:', updateError)
      setError(`${t('couldNotSubmitPriceChange', lang)} ${updateError.message}`)
      setActioning(false)
      return
    }

    notify('price_change_requested', jobId)
    setShowPriceChangeModal(false)
    await fetchJob()
    setActioning(false)
  }

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      bid_selected: t('statusSelected', lang),
      scheduled: t('statusScheduledFull', lang),
      in_progress: t('statusInProgressFull', lang),
      pending_review: t('statusAwaitingLandlordReview', lang),
      completed: t('statusCompleted', lang),
      archived: t('statusArchived', lang),
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
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/contractor" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
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
      <BottomTabBar tabs={CONTRACTOR_TABS} />
    </div>
  )

  if (error && !job) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">{error}</div>
    </div>
  )

  if (!job) return null

  const showSchedulingSection = myBid?.status === 'accepted' && ['bid_selected', 'scheduled'].includes(job.status)
  const isMyTurnToRespond = job.proposed_by && job.proposed_by !== 'contractor' && !job.schedule_confirmed
  const beforePhotos = photos.filter((p) => p.stage === 'before')
  const afterPhotos = photos.filter((p) => p.stage === 'after')
  const receiptPhotos = photos.filter((p) => p.stage === 'receipt')
  const reportedPhotos = photos.filter((p) => p.stage === 'general' || !p.stage)
  const canRequestPriceChange = myBid?.status === 'accepted' && ['bid_selected', 'scheduled', 'in_progress'].includes(job.status)

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/contractor" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <a href="#chat" onClick={scrollToChat} aria-label={t('goToChat', lang)} className="relative text-white/50 hover:text-white transition">
          <MessageCircleIcon className="w-5 h-5" />
          {hasUnread && <UnreadDot className="absolute -top-0.5 -right-0.5" />}
        </a>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h1 className="text-2xl font-bold text-white">{job.category}</h1>
            {job.is_emergency && (
              <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2.5 py-1 font-semibold">
                {t('emergency', lang)}
              </span>
            )}
          </div>
          <p className="text-white/60 text-sm">
            {myBid?.status === 'accepted' ? (
              <AddressLink address={job.units?.properties?.address} city={job.units?.properties?.city} />
            ) : (
              `${job.units?.properties?.address}, ${job.units?.properties?.city}`
            )}
            {' '}· Unit {job.units?.unit_number}
          </p>
          {myBid?.status === 'accepted' && job.units?.properties?.address && (
            <div className="mt-3">
              <StreetView address={job.units.properties.address} city={job.units.properties.city} />
            </div>
          )}
          {job.maintenance_items && (
            <p className="text-[#12A5A9] text-xs mt-1 flex items-center gap-1">
              <WrenchIcon className="w-3 h-3" />
              {job.maintenance_items.name}
              {job.maintenance_items.brand && `, ${job.maintenance_items.brand}`}
              {job.maintenance_items.install_date && `, installed ${new Date(job.maintenance_items.install_date + 'T00:00:00').getFullYear()}`}
            </p>
          )}
        </div>

        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">
              {t('statusPrefix', lang)} <span className="text-[#12A5A9]">
                {myBid?.status === 'declined' ? (myBid.selected_at ? t('statusCancelledByYou', lang) : t('statusNotSelected', lang)) : statusLabel(job.status)}
              </span>
            </h2>
            {job.status === 'scheduled' && job.schedule_confirmed && myBid?.status === 'accepted' && (
              <RippleButton
                onClick={handleStartJob}
                disabled={actioning}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {t('startJobBtn', lang)}
              </RippleButton>
            )}
          </div>
          {myBid?.status === 'declined' && (
            <p className="text-white/40 text-xs -mt-1 mb-3">
              {myBid.selected_at
                ? t('youCancelledReopened', lang)
                : t('landlordWentWithAnother', lang)}
            </p>
          )}
          {myBid?.status === 'accepted' && job.status === 'pending_review' && (
            <p className="text-white/40 text-xs -mt-1 mb-3">
              {t('paymentReleasedOnApproval', lang)}
            </p>
          )}
          <p className="text-white/70 text-sm leading-relaxed">{job.description}</p>

          {job.access_notes && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-3">
              <p className="text-white/50 text-xs font-semibold mb-1">{t('accessNotesForContractorHeading', lang)}</p>
              <p className="text-white/70 text-sm">{job.access_notes}</p>
            </div>
          )}

          {myBid && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mt-4">
              <p className="text-white/50 text-xs">{t('yourAcceptedBid', lang)}</p>
              {myBid.price_change_status === 'pending' ? (
                <div>
                  <p className="text-white/60 text-sm line-through">${myBid.amount}</p>
                  <p className="text-yellow-400 font-bold">${myBid.proposed_amount} <span className="text-xs font-normal">{t('pendingLandlordApproval', lang)}</span></p>
                </div>
              ) : (
                <p className="text-[#12A5A9] font-bold">
                  ${myBid.amount}
                  {myBid.pricing_type === 'hourly' && myBid.labor_rate && (
                    <span className="text-white/40 font-normal text-xs ml-1.5">(${myBid.labor_rate}/hr)</span>
                  )}
                </p>
              )}
              {myBid.selected_at && (
                <p className="text-white/50 text-xs mt-1">{t('selectedAt', lang)} {new Date(myBid.selected_at).toLocaleString()}</p>
              )}
              {myBid.price_change_status === 'rejected' && (
                <p className="text-red-400/70 text-xs mt-2">{t('priceChangeRequestDeclined', lang)}</p>
              )}
              {myBid.payment_status === 'paid' && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A7B7E]/20 text-[#12A5A9]">
                    <CheckCircleIcon className="w-3 h-3" /> {t('paidLabel', lang)}
                  </span>
                  <Link href={`/receipts/job/${myBid.id}`} className="text-[#12A5A9] text-xs font-semibold hover:underline">
                    {t('receipt', lang)}
                  </Link>
                </div>
              )}
            </div>
          )}

          {myBid?.status === 'accepted' && ['bid_selected', 'scheduled'].includes(job.status) && (
            <button
              onClick={handleCancelJob}
              disabled={actioning}
              className="text-red-400/70 hover:text-red-400 text-xs transition mt-3 disabled:opacity-50"
            >
              {t('cantDoJobCancel', lang)}
            </button>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
              {error}
            </div>
          )}
        </ScrollReveal>

        {myBid?.status === 'accepted' && (
          <JobProcessGuide
            jobStatus={job.status}
            scheduleConfirmed={!!job.schedule_confirmed}
            beforePhotoCount={beforePhotos.length}
            afterPhotoCount={afterPhotos.length}
          />
        )}

        {myBid?.status === 'accepted' && job.status === 'disputed' && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6 mb-4">
            <h3 className="text-yellow-400 font-semibold mb-1">{t('statusDisputedFull', lang)}</h3>
            <p className="text-white/60 text-sm">
              {t('disputeReviewDesc', lang)}
            </p>
          </div>
        )}

        {myBid?.status === 'accepted' && disputeEligible && (
          <div className="mb-4">
            <RaiseDisputeButton jobId={jobId} onRaised={fetchJob} />
          </div>
        )}

        {myBid?.status === 'accepted' && job.status === 'pending_review' && job.clarification_note && !job.clarification_response && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6 mb-4">
            <h3 className="text-yellow-400 font-semibold mb-2">{t('landlordAskedVerificationHeading', lang)}</h3>
            <p className="text-white/70 text-sm mb-1">{job.clarification_note}</p>
            <p className="text-white/50 text-xs mb-4">{t('replyInChatBelow', lang)}</p>
            <label className="text-white/70 text-sm block mb-1">{t('yourResponseLabel', lang)}</label>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={3}
              placeholder={t('responsePlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-3"
            />
            <button
              onClick={submitResponse}
              disabled={actioning}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {actioning ? t('sendingDots', lang) : t('sendResponseBtn', lang)}
            </button>
          </div>
        )}

        {reportedPhotos.length > 0 && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">{t('photosFromReport', lang)}</h3>
            <PhotoGrid photos={reportedPhotos} columns={3} />
          </div>
        )}

        {showSchedulingSection && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">{t('scheduleHeading', lang)}</h3>

            {!job.proposed_date ? (
              <div className="text-center py-4">
                <p className="text-white/50 text-sm mb-4">{t('noAppointmentProposedYet', lang)}</p>
                <button
                  onClick={openScheduleModal}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition"
                >
                  {t('proposeATimeBtn', lang)}
                </button>
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
                  {t('proposedByLabel', lang)} {job.proposed_by === 'contractor' ? t('you', lang) : job.proposed_by}
                </p>
                <p className="text-white text-sm">
                  {new Date(job.proposed_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {windowLabel(job.proposed_window, lang)}
                  {job.proposed_time && ` · ${job.proposed_time}`}
                </p>
                {isMyTurnToRespond ? (
                  <div className="flex items-center gap-3 mt-3">
                    <RippleButton
                      onClick={confirmSchedule}
                      disabled={actioning}
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      {t('confirmThisTime', lang)}
                    </RippleButton>
                    <button
                      onClick={openScheduleModal}
                      disabled={actioning}
                      className="text-white/50 text-xs hover:text-white transition"
                    >
                      {t('proposeDifferentTime', lang)}
                    </button>
                  </div>
                ) : (
                  <p className="text-white/60 text-xs mt-3">{t('waitingOnLandlordOrTenant', lang)}</p>
                )}
              </div>
            )}
          </ScrollReveal>
        )}

        {myBid?.status === 'accepted' && ['in_progress', 'pending_review', 'completed', 'archived'].includes(job.status) && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">{t('proofOfWorkHeading', lang)}</h3>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-sm font-medium">{t('beforeLabel', lang)} ({beforePhotos.length})</p>
                {job.status === 'in_progress' && (
                  <label>
                    <input type="file" accept="image/*,video/*" multiple onChange={(e) => handlePhotoUpload(e, 'before')} className="hidden" />
                    <span className="text-[#12A5A9] text-xs hover:underline cursor-pointer">{t('addPhotosLink', lang)}</span>
                  </label>
                )}
              </div>
              {beforePhotos.length === 0 ? (
                <p className="text-white/50 text-xs">{t('noBeforePhotosYet', lang)}</p>
              ) : (
                <PhotoGrid
                  photos={beforePhotos}
                  columns={3}
                  currentUserId={userId ?? undefined}
                  onDelete={job.status === 'in_progress' ? handleDeletePhoto : undefined}
                />
              )}
            </div>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/70 text-sm font-medium">{t('afterLabel', lang)} ({afterPhotos.length})</p>
                {job.status === 'in_progress' && (
                  <label>
                    <input type="file" accept="image/*,video/*" multiple onChange={(e) => handlePhotoUpload(e, 'after')} className="hidden" />
                    <span className="text-[#12A5A9] text-xs hover:underline cursor-pointer">{t('addPhotosLink', lang)}</span>
                  </label>
                )}
              </div>
              {afterPhotos.length === 0 ? (
                <p className={`text-xs ${job.status === 'in_progress' ? 'text-yellow-400' : 'text-white/50'}`}>
                  {job.status === 'in_progress'
                    ? t('addAfterPhotoRequired', lang)
                    : t('noAfterPhotosYet', lang)}
                </p>
              ) : (
                <PhotoGrid
                  photos={afterPhotos}
                  columns={3}
                  currentUserId={userId ?? undefined}
                  onDelete={job.status === 'in_progress' ? handleDeletePhoto : undefined}
                />
              )}
            </div>

            {(job.status === 'in_progress' || receiptPhotos.length > 0) && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white/70 text-sm font-medium">{t('materialReceiptsLabel', lang)} ({receiptPhotos.length})</p>
                  {job.status === 'in_progress' && (
                    <label>
                      <input type="file" accept="image/*,video/*" multiple onChange={(e) => handlePhotoUpload(e, 'receipt')} className="hidden" />
                      <span className="text-[#12A5A9] text-xs hover:underline cursor-pointer">{t('addReceiptLink', lang)}</span>
                    </label>
                  )}
                </div>
                {receiptPhotos.length === 0 ? (
                  <p className="text-white/50 text-xs">
                    {t('receiptHelpText', lang)}
                  </p>
                ) : (
                  <PhotoGrid
                    photos={receiptPhotos}
                    columns={3}
                    currentUserId={userId ?? undefined}
                    onDelete={job.status === 'in_progress' ? handleDeletePhoto : undefined}
                  />
                )}
              </div>
            )}

            {job.status === 'in_progress' && (
              <>
                {canRequestPriceChange && myBid?.price_change_status !== 'pending' && (
                  <button
                    onClick={openPriceChangeModal}
                    className="w-full bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition mb-3"
                  >
                    {t('requestPriceChangeBtn', lang)}
                  </button>
                )}
                <RippleButton
                  onClick={openCompleteModal}
                  disabled={actioning || uploading}
                  className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
                >
                  {uploading ? t('uploading', lang) : t('markJobCompleteBtn', lang)}
                </RippleButton>
              </>
            )}

            {job.status === 'pending_review' && (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center">
                <p className="text-white/50 text-sm">{t('waitingLandlordReviewAutoApprove', lang)}</p>
              </div>
            )}
          </ScrollReveal>
        )}

        {userId && myBid?.status === 'accepted' && (
          <JobChatCard
            jobId={jobId}
            title={t('chatWithLandlordTitle', lang)}
            subtitle={t('chatSubtitleGeneric', lang)}
            onRead={() => setHasUnread(false)}
          />
        )}
      </main>

      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-4">{t('proposeATimeHeading', lang)}</h3>

            {job.schedule_confirmed && job.proposed_date && lateRescheduleWarning(job.proposed_date) && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-yellow-400/90 text-xs leading-relaxed">{lateRescheduleWarning(job.proposed_date)}</p>
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

      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">{t('markJobCompleteQ', lang)}</h3>
            <p className="text-white/50 text-sm mb-6">
              {t('markCompleteDesc', lang)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
              </button>
              <button
                onClick={confirmMarkComplete}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? t('submittingDots', lang) : t('markCompleteBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResponseSentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center">
            <h3 className="text-white font-semibold mb-2 flex items-center justify-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" /> {t('messageSentHeading', lang)}
            </h3>
            <p className="text-white/50 text-sm mb-5">{t('landlordCanSeeResponse', lang)}</p>
            <button
              onClick={() => setShowResponseSentModal(false)}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:opacity-90 transition"
            >
              {t('gotIt', lang)}
            </button>
          </div>
        </div>
      )}

      {showPriceChangeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-1">{t('requestPriceChangeHeading', lang)}</h3>
            <p className="text-white/50 text-sm mb-4">
              {t('currentPriceLabel', lang)} <span className="text-white/70 font-semibold">${Number(myBid?.amount || 0).toFixed(2)}</span>
            </p>

            <label className="text-white/70 text-sm block mb-1">{t('laborDollarLabel', lang)}</label>
            <input
              type="number"
              value={laborAmount}
              onChange={(e) => setLaborAmount(e.target.value)}
              min="0"
              step="0.01"
              placeholder="150"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition mb-4"
            />

            <label className="text-white/70 text-sm block mb-1">{t('partsOptionalDollarLabel', lang)}</label>
            <input
              type="number"
              value={partsAmount}
              onChange={(e) => setPartsAmount(e.target.value)}
              min="0"
              step="0.01"
              placeholder="80"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition mb-4"
            />

            <p className="text-white/50 text-sm mb-4">
              {t('newTotalLabel', lang)} <span className="text-white font-semibold">${((parseFloat(laborAmount) || 0) + (parseFloat(partsAmount) || 0)).toFixed(2)}</span>
              {(() => {
                const oldPrice = Number(myBid?.amount || 0)
                const newTotal = (parseFloat(laborAmount) || 0) + (parseFloat(partsAmount) || 0)
                const delta = newTotal - oldPrice
                if (newTotal <= 0 || delta === 0) return null
                return (
                  <span className={delta > 0 ? 'text-yellow-400' : 'text-[#12A5A9]'}>
                    {' '}({delta > 0 ? '+' : ''}${delta.toFixed(2)} {t('changeFromCurrentSuffix', lang)})
                  </span>
                )
              })()}
            </p>

            <label className="text-white/70 text-sm block mb-1">{t('reasonLabel', lang)}</label>
            <textarea
              value={priceChangeReason}
              onChange={(e) => setPriceChangeReason(e.target.value)}
              rows={3}
              placeholder={t('priceChangeReasonPlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-5"
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowPriceChangeModal(false)}
                disabled={actioning}
                className="flex-1 bg-white/8 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-white/12 transition disabled:opacity-50"
              >
                {t('cancel', lang)}
              </button>
              <button
                onClick={submitPriceChange}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? t('sendingDots', lang) : t('sendRequestBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomTabBar tabs={CONTRACTOR_TABS} />
    </div>
  )
}