'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { expectRow } from '@/lib/expectRow'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { PhotoGrid } from '@/components/PhotoGrid'
import { notify } from '@/lib/notify'
import { postJobStatusMessage } from '@/lib/systemMessage'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { CheckCircleIcon, MessageCircleIcon } from '@/components/icons'
import { RaiseDisputeButton } from '@/components/RaiseDisputeButton'
import { UnreadDot } from '@/components/UnreadDot'
import { JobChatCard, scrollToChat } from '@/components/JobChatCard'
import { getUnreadJobIds } from '@/lib/messageReads'
import { useJobRealtime } from '@/lib/useJobRealtime'
import { RENTER_TABS } from '@/lib/navTabs'
import { TIME_WINDOWS, validateScheduleTime, rescheduleLockError } from '@/lib/scheduleWindows'
import { useLanguage, t, windowLabel } from '@/lib/i18n'

export default function RenterJobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasUnread, setHasUnread] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actioning, setActioning] = useState(false)

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleWindow, setScheduleWindow] = useState('morning')
  const [scheduleTime, setScheduleTime] = useState('')
  const [showProposedModal, setShowProposedModal] = useState(false)

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
      .select('*')
      .eq('id', jobId)
      .maybeSingle()

    if (jobError || !jobData) {
      console.error('Error loading job:', jobError)
      setError(t('jobNotFoundAccessible', lang))
      setLoading(false)
      return
    }

    setJob(jobData)

    const { data: photosData } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })

    if (photosData && photosData.length > 0) {
      const enriched = await Promise.all(
        photosData.map(async (photo) => {
          const { data: signedUrlData } = await supabase.storage
            .from('job-photos')
            .createSignedUrl(photo.photo_url, 3600)
          return { ...photo, displayUrl: signedUrlData?.signedUrl }
        })
      )
      setPhotos(enriched)
    } else {
      setPhotos([])
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
      setError(t('couldNotRemovePhoto', lang))
      return
    }

    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
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

    if (job.schedule_confirmed && job.proposed_date) {
      const lockError = rescheduleLockError(job.proposed_date)
      if (lockError) {
        setError(lockError)
        return
      }
    }

    setActioning(true)
    setError(null)

    const { error: updateError } = await expectRow(supabase
      .from('jobs')
      .update({
        proposed_date: scheduleDate,
        proposed_window: scheduleWindow,
        proposed_time: scheduleTime || null,
        proposed_by: 'renter',
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

    notify('schedule_proposed', jobId, 'renter')
    setShowScheduleModal(false)
    await fetchJob()
    setActioning(false)
    setShowProposedModal(true)
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
      notify('schedule_confirmed', jobId)
      if (userId) postJobStatusMessage(jobId, userId, '✓ Schedule confirmed')
    }

    await fetchJob()
    setActioning(false)
  }

  const statusLabel = (status: string) => {
    if (job.proposed_date && !job.schedule_confirmed) {
      return job.proposed_by === 'renter' ? t('newTimeProposedByYou', lang) : t('newTimeProposedByOther', lang)
    }
    const labels: Record<string, string> = {
      pending_approval: t('statusLandlordFinding', lang),
      approved: t('statusLandlordFinding', lang),
      bidding: t('statusLandlordFinding', lang),
      bid_selected: t('statusLandlordFinding', lang),
      scheduled: t('statusScheduledFull', lang),
      in_progress: t('statusWorkInProgress', lang),
      pending_review: t('statusWorkCompleteWaiting', lang),
      completed: t('statusCompleted', lang),
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
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>
      <main className="max-w-2xl mx-auto px-6 py-10 pb-28">
        <div className="mb-6">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-32 mb-4" />
        <Skeleton className="h-48" />
      </main>
      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )

  if (error && !job) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">{error}</div>
    </div>
  )

  if (!job) return null

  const showSchedulingSection = ['bid_selected', 'scheduled'].includes(job.status)
  const isMyTurnToRespond = job.proposed_by && job.proposed_by !== 'renter' && !job.schedule_confirmed
  const generalPhotos = photos.filter((p) => p.stage === 'general' || !p.stage)
  const beforePhotos = photos.filter((p) => p.stage === 'before')
  const afterPhotos = photos.filter((p) => p.stage === 'after')

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/renter" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/renter" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
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
        </div>

        <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <h2 className="text-white font-semibold mb-3">
            {t('statusPrefix', lang)} <span className="text-[#12A5A9]">{statusLabel(job.status)}</span>
          </h2>
          <p className="text-white/70 text-sm leading-relaxed">{job.description}</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mt-3">
              {error}
            </div>
          )}
        </ScrollReveal>

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


        {job.schedule_ask_tenant && !job.proposed_date && (
          <div className="bg-blue-500/10 border border-blue-400/30 rounded-2xl p-5 mb-4">
            <p className="text-blue-300 text-sm font-medium">{t('landlordWantsYouToPickTime', lang)}</p>
          </div>
        )}

        {showSchedulingSection && (
          <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">{t('scheduleHeading', lang)}</h3>

            {!job.proposed_date ? (
              <div className="text-center py-4">
                <p className="text-white/50 text-sm mb-4">{t('noAppointmentProposedYet', lang)}</p>
                <RippleButton
                  onClick={openScheduleModal}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition"
                >
                  {t('proposeATimeBtn', lang)}
                </RippleButton>
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
                {rescheduleLockError(job.proposed_date) ? (
                  <p className="text-white/40 text-xs mt-2">{rescheduleLockError(job.proposed_date)}</p>
                ) : (
                  <button
                    onClick={openScheduleModal}
                    disabled={actioning}
                    className="text-white/50 text-xs hover:text-white transition mt-2"
                  >
                    {t('rescheduleBtn', lang)}
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                <p className="text-yellow-400/80 text-xs mb-1">
                  {t('proposedByLabel', lang)} {job.proposed_by === 'renter' ? t('you', lang) : job.proposed_by}
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
                  <p className="text-white/60 text-xs mt-3">{t('waitingOnLandlordOrContractor', lang)}</p>
                )}
              </div>
            )}
          </ScrollReveal>
        )}

        {['in_progress', 'pending_review', 'completed'].includes(job.status) && (beforePhotos.length > 0 || afterPhotos.length > 0) && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">{t('proofOfWorkHeading', lang)}</h3>
            {beforePhotos.length > 0 && (
              <div className="mb-5">
                <p className="text-white/70 text-sm font-medium mb-2">{t('beforeLabel', lang)}</p>
                <PhotoGrid photos={beforePhotos} columns={3} />
              </div>
            )}
            {afterPhotos.length > 0 && (
              <div>
                <p className="text-white/70 text-sm font-medium mb-2">{t('afterLabel', lang)}</p>
                <PhotoGrid photos={afterPhotos} columns={3} />
              </div>
            )}
          </div>
        )}

        {generalPhotos.length > 0 && (
          <div>
            <h3 className="text-white font-semibold mb-3">{t('yourPhotosHeading', lang)}</h3>
            <PhotoGrid
              photos={generalPhotos}
              columns={2}
              thumbHeight="h-40"
              currentUserId={userId ?? undefined}
              onDelete={!['completed', 'archived'].includes(job.status) ? handleDeletePhoto : undefined}
            />
          </div>
        )}

        {userId && (
          <JobChatCard
            jobId={jobId}
            title={t('jobChatTitle', lang)}
            subtitle={t('jobChatSubtitleRenter', lang)}
            onRead={() => setHasUnread(false)}
          />
        )}
      </main>

      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-4">{t('proposeATimeHeading', lang)}</h3>

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

      {showProposedModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center">
            <h3 className="text-white font-semibold mb-2 flex items-center justify-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" /> {t('timeProposedHeading', lang)}
            </h3>
            <p className="text-white/50 text-sm mb-5">{t('willLetYouKnowConfirmed', lang)}</p>
            <button
              onClick={() => setShowProposedModal(false)}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:opacity-90 transition"
            >
              {t('gotIt', lang)}
            </button>
          </div>
        </div>
      )}

      <BottomTabBar tabs={RENTER_TABS} />
    </div>
  )
}