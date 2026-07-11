'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState<any>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actioning, setActioning] = useState(false)

  const [showBiddingModal, setShowBiddingModal] = useState(false)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineNote, setDeclineNote] = useState('')
  const [showSelectModal, setShowSelectModal] = useState(false)
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null)
  const [showArchiveModal, setShowArchiveModal] = useState(false)

  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleWindow, setScheduleWindow] = useState('morning')
  const [scheduleTime, setScheduleTime] = useState('')

  const TIME_WINDOWS = [
    { value: 'morning', label: 'Morning (8am–12pm)' },
    { value: 'afternoon', label: 'Afternoon (12pm–5pm)' },
    { value: 'evening', label: 'Evening (5pm–8pm)' },
  ]

  const fetchJob = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: jobData, error: jobError } = await supabase
      .from('jobs')
      .select('*, units(unit_number, property_id, properties(id, address, city, state))')
      .eq('id', jobId)
      .maybeSingle()

    if (jobError || !jobData) {
      console.error('Error loading job:', jobError)
      setError('Job not found.')
      setLoading(false)
      return
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

    if (['bidding', 'bid_selected', 'scheduled', 'in_progress', 'completed', 'archived'].includes(jobData.status)) {
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
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchJob()
  }, [jobId, router])

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
      .update({ status: 'accepted' })
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
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error proposing schedule:', updateError)
      setError('Could not propose a schedule.')
      setActioning(false)
      return
    }

    setShowScheduleModal(false)
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

  const windowLabel = (w: string) => TIME_WINDOWS.find((t) => t.value === w)?.label || w

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  if (error && !job) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">{error}</div>
    </div>
  )

  if (!job) return null

  const selectedBid = bids.find((b) => b.id === selectedBidId)
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
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10">

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
              <p className="text-white/40 text-sm">
                {job.units?.properties?.address}, {job.units?.properties?.city} · Unit {job.units?.unit_number}
              </p>
            </div>
            {job.status === 'completed' && (
              <button
                onClick={() => setShowArchiveModal(true)}
                className="text-white/40 hover:text-white text-xs transition shrink-0"
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
          </div>

          <p className="text-white/70 text-sm leading-relaxed">{job.description}</p>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
            <span className="text-xs bg-white/8 text-white/50 rounded-full px-2.5 py-1 capitalize">
              {job.urgency} urgency
            </span>
          </div>

          <p className="text-white/30 text-xs mt-3">
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

        {job.status === 'bidding' && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">
              Sealed bids {bids.length > 0 && `(${bids.length})`}
            </h3>
            {bids.length === 0 ? (
              <p className="text-white/30 text-sm">No bids yet — contractors in range have been notified.</p>
            ) : (
              <div className="space-y-3">
                {bids.map((bid) => (
                  <div key={bid.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white font-semibold">{bid.contractor?.full_name || 'Unknown contractor'}</p>
                      <p className="text-[#12A5A9] font-bold">${bid.amount}</p>
                    </div>
                    {bid.availability && <p className="text-white/50 text-xs">Availability: {bid.availability}</p>}
                    {bid.estimated_hours && <p className="text-white/50 text-xs">Est. hours: {bid.estimated_hours}</p>}
                    {bid.notes && <p className="text-white/40 text-xs mt-1 italic">{bid.notes}</p>}
                    <button
                      onClick={() => handleSelectBidClick(bid.id)}
                      disabled={actioning}
                      className="mt-3 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      Select this contractor
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {['bid_selected', 'scheduled', 'in_progress', 'completed', 'archived'].includes(job.status) && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-3">Selected contractor</h3>
            {bids.filter((b) => b.status === 'accepted').map((bid) => (
              <div key={bid.id}>
                <p className="text-white font-semibold">{bid.contractor?.full_name}</p>
                <p className="text-[#12A5A9] font-bold text-sm mt-1">${bid.amount}</p>
                {bid.availability && <p className="text-white/50 text-xs mt-1">Availability: {bid.availability}</p>}
              </div>
            ))}
          </div>
        )}

        {showSchedulingSection && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">Schedule</h3>

            {!job.proposed_date ? (
              <div className="text-center py-4">
                <p className="text-white/30 text-sm mb-4">No appointment proposed yet.</p>
                <button
                  onClick={openScheduleModal}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition"
                >
                  Propose a time
                </button>
              </div>
            ) : job.schedule_confirmed ? (
              <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3">
                <p className="text-[#12A5A9] text-sm font-medium">✓ Confirmed</p>
                <p className="text-white text-sm mt-1">
                  {new Date(job.proposed_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {windowLabel(job.proposed_window)}
                  {job.proposed_time && ` · ${job.proposed_time}`}
                </p>
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
                  <p className="text-white/40 text-xs mt-3">Waiting on the other party to confirm.</p>
                )}
              </div>
            )}
          </div>
        )}

        {['in_progress', 'completed', 'archived'].includes(job.status) && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">Proof of work</h3>
            <div className="mb-5">
              <p className="text-white/70 text-sm font-medium mb-2">Before ({beforePhotos.length})</p>
              {beforePhotos.length === 0 ? (
                <p className="text-white/30 text-xs">No before photos yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {beforePhotos.map((p) => (
                    <img key={p.id} src={p.displayUrl} alt="Before" className="w-full h-24 object-cover rounded-lg" />
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-white/70 text-sm font-medium mb-2">After ({afterPhotos.length})</p>
              {afterPhotos.length === 0 ? (
                <p className="text-white/30 text-xs">No after photos yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {afterPhotos.map((p) => (
                    <img key={p.id} src={p.displayUrl} alt="After" className="w-full h-24 object-cover rounded-lg" />
                  ))}
                </div>
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
              <p className="text-white/30 text-sm">No photos attached.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {generalPhotos.map((photo) => (
                <div key={photo.id} className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
                  <img
                    src={photo.displayUrl}
                    alt="Job photo"
                    className="w-full h-40 object-cover"
                  />
                  <div className="p-3">
                    <p className="text-white/60 text-xs">
                      {photo.uploader?.full_name || 'Unknown'}
                    </p>
                    <p className="text-white/30 text-xs mt-0.5">
                      {new Date(photo.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showBiddingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-20">
          <div className="bg-[#0C1A2E] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Job acknowledged ✓</h3>
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
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none mb-5"
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
              <button
                onClick={confirmSelectBid}
                disabled={actioning}
                className="flex-1 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {actioning ? 'Selecting...' : 'Confirm'}
              </button>
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
    </div>
  )
}