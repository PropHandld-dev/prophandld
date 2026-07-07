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
    }

    if (['bidding', 'bid_selected', 'scheduled', 'in_progress', 'completed'].includes(jobData.status)) {
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

  const handleApprove = async () => {
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

    const startBidding = window.confirm('Let contractors start bidding on this job?')

    if (startBidding) {
      const { error: biddingError } = await supabase
        .from('jobs')
        .update({ status: 'bidding' })
        .eq('id', jobId)

      if (biddingError) {
        console.error('Error starting bidding:', biddingError)
        setError('Acknowledged, but could not start bidding.')
      }
    }

    await fetchJob()
    setActioning(false)
  }

  const handleDecline = async () => {
    const note = window.prompt('Optional note to the renter about why this was declined:')
    setActioning(true)

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'declined', landlord_notes: note || null })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error declining job:', updateError)
      setError('Could not decline job.')
    }

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

  const handleSelectBid = async (bidId: string) => {
    const confirmed = window.confirm('Select this contractor for the job? Other bids will be marked as not selected.')
    if (!confirmed) return

    setActioning(true)
    setError(null)

    const { error: selectError } = await supabase
      .from('bids')
      .update({ status: 'accepted' })
      .eq('id', bidId)

    if (selectError) {
      console.error('Error selecting bid:', selectError)
      setError('Could not select this bid.')
      setActioning(false)
      return
    }

    const { error: declineOthersError } = await supabase
      .from('bids')
      .update({ status: 'declined' })
      .eq('job_id', jobId)
      .neq('id', bidId)

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

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">
              Status: <span className="text-[#12A5A9]">{statusLabel(job.status)}</span>
            </h2>
            {job.status === 'pending_approval' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleApprove}
                  disabled={actioning}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                >
                  Acknowledge
                </button>
                <button
                  onClick={handleDecline}
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
                      onClick={() => handleSelectBid(bid.id)}
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

        {['bid_selected', 'scheduled', 'in_progress', 'completed'].includes(job.status) && (
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

        <div>
          <h3 className="text-white font-semibold mb-3">
            Photos {photos.length > 0 && `(${photos.length})`}
          </h3>
          {photos.length === 0 ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
              <p className="text-white/30 text-sm">No photos attached.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo) => (
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
    </div>
  )
}