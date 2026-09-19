'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { notify } from '@/lib/notify'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { WrenchIcon } from '@/components/icons'
import { CONTRACTOR_TABS } from '@/lib/navTabs'

export default function SubmitBidPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [linkedSystem, setLinkedSystem] = useState<any>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [alreadyBid, setAlreadyBid] = useState(false)
  const [zoomedPhoto, setZoomedPhotoState] = useState<string | null>(null)

  // Zooming pushes a throwaway history entry so the browser's own Back
  // button/gesture closes the zoom instead of navigating off the page
  // entirely — closing it any other way pops that entry back off so a
  // real Back press afterward doesn't need to be pressed twice.
  const openZoom = (url: string) => {
    window.history.pushState({ zoom: true }, '')
    setZoomedPhotoState(url)
  }
  const closeZoom = () => {
    if (window.history.state?.zoom) window.history.back()
    setZoomedPhotoState(null)
  }
  useEffect(() => {
    const handlePopState = () => setZoomedPhotoState(null)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const [form, setForm] = useState({
    amount: '',
    availability: '',
    estimated_hours: '',
    notes: '',
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      // Must match the same zip+radius logic the dashboard job list uses
      // (/api/contractor/available-jobs) — this used to call the old
      // exact-zip-match RPC that route replaced, which wrongly rejected
      // jobs the contractor could see and open from the dashboard list.
      const availableJobsRes = await fetch('/api/contractor/available-jobs')
      const availableJobsData = await availableJobsRes.json().catch(() => ({ jobs: [] }))
      const availableJobs = availableJobsData.jobs || []
      const matchedJob = availableJobs.find((j: any) => j.id === jobId)

      if (!matchedJob) {
        const { data: existingBid } = await supabase
          .from('bids')
          .select('id')
          .eq('job_id', jobId)
          .eq('contractor_user_id', user.id)
          .maybeSingle()

        if (existingBid) {
          setAlreadyBid(true)
        } else {
          setError('This job is no longer available to bid on.')
        }
        setLoading(false)
        return
      }

      setJob(matchedJob)

      const { data: systemData } = await supabase
        .rpc('get_linked_maintenance_item_for_job', { job_id_input: jobId })
        .maybeSingle()

      if (systemData) setLinkedSystem(systemData)

      const { data: photosData } = await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId)
        .eq('stage', 'general')
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
      }

      setLoading(false)
    }
    init()
  }, [jobId, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Enter a valid bid amount.')
      return
    }

    setSubmitting(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated.')
      setSubmitting(false)
      return
    }

    const { error: insertError } = await supabase
      .from('bids')
      .insert({
        job_id: jobId,
        contractor_user_id: user.id,
        amount: parseFloat(form.amount),
        availability: form.availability || null,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
        notes: form.notes || null,
        status: 'pending',
      })

    if (insertError) {
      console.error('Error submitting bid:', insertError)
      setError('Could not submit bid: ' + insertError.message)
      setSubmitting(false)
      return
    }

    notify('bid_received', jobId)

    router.push('/contractor')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/contractor" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>
      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-28 mb-4" />
        <Skeleton className="h-4 w-56 mb-4" />
        <div className="space-y-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-24" />
        </div>
      </main>
      <BottomTabBar tabs={CONTRACTOR_TABS} />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/contractor" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        {alreadyBid ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">You've already submitted a bid on this job.</p>
          </div>
        ) : error && !job ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        ) : job ? (
          <ScrollReveal>
            <h1 className="text-2xl font-bold text-white mb-2">Submit a bid</h1>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-4">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-white font-semibold">{job.category}</h3>
                {job.is_emergency && (
                  <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-semibold">
                    Emergency
                  </span>
                )}
              </div>
              <p className="text-white/60 text-sm">{job.description}</p>
              <p className="text-white/50 text-xs mt-2">
                {job.address}, {job.city}, {job.state} · Unit {job.unit_number}
              </p>
              {linkedSystem && (
                <p className="text-[#12A5A9] text-xs mt-1 flex items-center gap-1">
                  <WrenchIcon className="w-3 h-3" />
                  {linkedSystem.name}
                  {linkedSystem.brand && `, ${linkedSystem.brand}`}
                  {linkedSystem.install_date && `, installed ${new Date(linkedSystem.install_date + 'T00:00:00').getFullYear()}`}
                </p>
              )}
            </div>

            {photos.length > 0 && (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
                <h3 className="text-white font-semibold text-sm mb-3">Photos from tenant's report</h3>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openZoom(p.displayUrl)}
                      className="block"
                    >
                      <img
                        src={p.displayUrl}
                        alt="Reported issue"
                        className="w-full h-24 object-cover rounded-lg hover:opacity-80 transition cursor-zoom-in"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-white/50 text-xs mb-4">
              🔒 Your bid is sealed. Other contractors can't see your price, and you can't see theirs.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-white/70 text-sm block mb-1">Your bid amount ($)</label>
                <input
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  required
                  min="1"
                  step="0.01"
                  placeholder="450"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>

              <div>
                <label className="text-white/70 text-sm block mb-1">Availability</label>
                <input
                  type="text"
                  name="availability"
                  value={form.availability}
                  onChange={handleChange}
                  placeholder="Can start tomorrow, mornings work best"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>

              <div>
                <label className="text-white/70 text-sm block mb-1">Estimated hours</label>
                <input
                  type="number"
                  name="estimated_hours"
                  value={form.estimated_hours}
                  onChange={handleChange}
                  min="0"
                  step="0.5"
                  placeholder="2"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>

              <div>
                <label className="text-white/70 text-sm block mb-1">Notes (optional)</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Anything the landlord should know"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <RippleButton
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit sealed bid'}
              </RippleButton>
            </form>
          </ScrollReveal>
        ) : null}
      </main>

      {zoomedPhoto && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center p-6 z-30 cursor-zoom-out"
          onClick={closeZoom}
        >
          <img
            src={zoomedPhoto}
            alt="Zoomed photo"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}

      <BottomTabBar tabs={CONTRACTOR_TABS} />
    </div>
  )
}