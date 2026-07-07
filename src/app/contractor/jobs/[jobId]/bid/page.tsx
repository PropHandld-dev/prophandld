'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function SubmitBidPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [job, setJob] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [alreadyBid, setAlreadyBid] = useState(false)

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
        router.push('/login')
        return
      }

      const { data: availableJobs } = await supabase.rpc('get_available_jobs_for_contractor')
      const matchedJob = (availableJobs || []).find((j: any) => j.id === jobId)

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

    router.push('/contractor')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center">
      <div className="text-white/50">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <span className="text-white font-semibold text-sm">Prophandld</span>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10">
        {alreadyBid ? (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 text-center">
            <p className="text-white/50 text-sm">You've already submitted a bid on this job.</p>
          </div>
        ) : error && !job ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        ) : job ? (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Submit a bid</h1>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-6">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="text-white font-semibold">{job.category}</h3>
                {job.is_emergency && (
                  <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-semibold">
                    Emergency
                  </span>
                )}
              </div>
              <p className="text-white/60 text-sm">{job.description}</p>
              <p className="text-white/30 text-xs mt-2">
                {job.address}, {job.city}, {job.state} · Unit {job.unit_number}
              </p>
            </div>

            <p className="text-white/30 text-xs mb-4">
              🔒 Your bid is sealed — other contractors can't see your price, and you can't see theirs.
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit sealed bid'}
              </button>
            </form>
          </>
        ) : null}
      </main>
    </div>
  )
}