'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { StarRatingInput } from '@/components/StarRatingInput'
import { useLanguage, t } from '@/lib/i18n'

type Review = {
  reviewer_role: 'landlord' | 'renter'
  price_rating: number | null
  timeliness_rating: number | null
  quality_rating: number | null
  communication_rating: number | null
  comment: string
  created_at: string
}

// Reviews were being collected (ratings + a comment) but never actually
// shown to anyone except the person who wrote theirs, re-editing it —
// not the contractor being reviewed, not any other landlord deciding
// whether to pick them. This is what surfaces them, everywhere a review
// might actually be useful. Deliberately anonymous: no reviewer name and
// no job/property details come back from get_contractor_reviews (see the
// SQL) — same "hidden work history" instinct the rest of the app already
// applies, just extended to keep a comment from doubling as a way to
// identify or retaliate against whoever wrote it.
export function ContractorReviewsList({ contractorUserId }: { contractorUserId: string }) {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<Review[]>([])

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('get_contractor_reviews', { target_contractor_id: contractorUserId, limit_n: 20 })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('ContractorReviewsList: error loading reviews', error)
        setReviews(data || [])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [contractorUserId])

  if (loading) return <p className="text-white/40 text-sm">{t('loadingReviewsMsg', lang)}</p>
  if (reviews.length === 0) return <p className="text-white/40 text-sm">{t('noWrittenReviewsYet', lang)}</p>

  const avgOf = (r: Review) => {
    const vals = [r.timeliness_rating, r.quality_rating, r.communication_rating, r.price_rating].filter(
      (v): v is number => typeof v === 'number' && v > 0
    )
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }

  return (
    <div className="space-y-3">
      {reviews.map((r, i) => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-white/50 text-xs font-semibold">
              {r.reviewer_role === 'landlord' ? t('landlordReviewerLabel', lang) : t('renterReviewerLabel', lang)}
            </span>
            <StarRatingInput value={Math.round(avgOf(r))} readOnly size="sm" />
          </div>
          <p className="text-white/70 text-sm italic">&quot;{r.comment}&quot;</p>
        </div>
      ))}
    </div>
  )
}
