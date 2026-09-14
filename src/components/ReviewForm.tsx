'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { StarRatingInput } from '@/components/StarRatingInput'
import { RippleButton } from '@/components/RippleButton'

type ReviewerRole = 'landlord' | 'renter'

const CATEGORY_CONFIG: Record<ReviewerRole, { key: string; label: string }[]> = {
  landlord: [
    { key: 'price_rating', label: 'Price fairness' },
    { key: 'timeliness_rating', label: 'Timeliness' },
    { key: 'quality_rating', label: 'Quality of work' },
    { key: 'communication_rating', label: 'Communication' },
  ],
  renter: [
    { key: 'timeliness_rating', label: 'Timeliness' },
    { key: 'quality_rating', label: 'Quality of work' },
    { key: 'communication_rating', label: 'Communication' },
  ],
}

export function ReviewForm({
  jobId,
  contractorUserId,
  reviewerRole,
  onSubmitted,
}: {
  jobId: string
  contractorUserId: string
  reviewerRole: ReviewerRole
  onSubmitted?: (review: any) => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingReview, setExistingReview] = useState<any>(null)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')

  const categories = CATEGORY_CONFIG[reviewerRole]

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('contractor_reviews')
        .select('*')
        .eq('job_id', jobId)
        .eq('reviewer_user_id', user.id)
        .maybeSingle()

      if (data) {
        setExistingReview(data)
        setRatings({
          price_rating: data.price_rating || 0,
          timeliness_rating: data.timeliness_rating || 0,
          quality_rating: data.quality_rating || 0,
          communication_rating: data.communication_rating || 0,
        })
        setComment(data.comment || '')
      }
      setLoading(false)
    }
    load()
  }, [jobId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const missing = categories.some((c) => !ratings[c.key])
    if (missing) {
      setError('Please rate every category.')
      return
    }

    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      return
    }

    const payload: any = {
      job_id: jobId,
      contractor_user_id: contractorUserId,
      reviewer_user_id: user.id,
      reviewer_role: reviewerRole,
      timeliness_rating: ratings.timeliness_rating,
      quality_rating: ratings.quality_rating,
      communication_rating: ratings.communication_rating,
      comment: comment.trim() || null,
    }
    if (reviewerRole === 'landlord') payload.price_rating = ratings.price_rating

    const { data: saved, error: upsertError } = await supabase
      .from('contractor_reviews')
      .upsert(payload, { onConflict: 'job_id,reviewer_user_id' })
      .select()
      .single()

    if (upsertError) {
      console.error('Error saving review:', upsertError)
      setError(`Could not save review: ${upsertError.message}`)
      setSaving(false)
      return
    }

    setExistingReview(saved)
    setSaving(false)
    onSubmitted?.(saved)
  }

  if (loading) return null

  if (existingReview) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-4">Your review</h3>
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.key} className="flex items-center justify-between">
              <span className="text-white/50 text-sm">{c.label}</span>
              <StarRatingInput value={existingReview[c.key] || 0} readOnly size="sm" />
            </div>
          ))}
        </div>
        {existingReview.comment && (
          <p className="text-white/40 text-sm mt-3 italic">&quot;{existingReview.comment}&quot;</p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 space-y-4">
      <h3 className="text-white font-semibold">Rate this contractor</h3>
      {categories.map((c) => (
        <StarRatingInput
          key={c.key}
          label={c.label}
          value={ratings[c.key] || 0}
          onChange={(n) => setRatings({ ...ratings, [c.key]: n })}
        />
      ))}
      <div>
        <label className="text-white/70 text-sm block mb-1">Comment (optional)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Anything else worth mentioning?"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition resize-none"
        />
      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}
      <RippleButton
        type="submit"
        disabled={saving}
        className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Submitting...' : 'Submit review'}
      </RippleButton>
    </form>
  )
}
