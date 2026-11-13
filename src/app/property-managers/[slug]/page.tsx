'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MagneticLink } from '@/components/MagneticLink'
import { RippleButton } from '@/components/RippleButton'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BuildingIcon, StarIcon, ShieldIcon } from '@/components/icons'
import { GoogleTranslateToggle } from '@/components/GoogleTranslateToggle'
import { supabase } from '@/lib/supabase'

type Profile = {
  name: string
  pitch: string | null
  clientCount: number
  unitCount: number
  avgRating: number | null
  reviews: { rating: number; comment: string | null; createdAt: string; reviewerFirstName: string }[]
}

function Stars({ value }: { value: number }) {
  return (
    <span className="text-yellow-400 text-sm tracking-wide">
      {'★'.repeat(Math.round(value))}
      <span className="text-white/15">{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  )
}

export default function PmPublicProfilePage() {
  const params = useParams()
  const slug = params.slug as string

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [isLandlord, setIsLandlord] = useState(false)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  // Distinguishes "logged out" from "logged in as a renter/contractor" --
  // both used to fall into the same signup-redirect bucket below, which
  // silently funneled an already-logged-in renter/contractor toward
  // creating an unrelated new account with zero explanation.
  const [loggedInOtherRole, setLoggedInOtherRole] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [requestMsg, setRequestMsg] = useState<string | null>(null)

  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewMsg, setReviewMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/pm/profile/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then((data) => setProfile(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))

    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionRole = session?.user?.app_metadata?.role
      if (!sessionRole) return
      if (sessionRole !== 'landlord') {
        setLoggedInOtherRole(sessionRole)
        return
      }
      setIsLandlord(true)
      // Catches a PM admin or staff member viewing their own public
      // profile -- without this, "Request to be managed by [your own
      // company]" and "Leave a review" would both show, which makes no
      // sense for someone who already runs the place.
      fetch('/api/pm/profile-settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.slug === slug) setIsOwnProfile(true)
        })
        .catch(() => {})
    })
  }, [slug])

  const handleRequest = async () => {
    setRequesting(true)
    setRequestMsg(null)
    try {
      const res = await fetch('/api/pm/clients/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRequestMsg(
          data.error === 'already_requested_or_managed'
            ? "You've already requested this company, or you're already managed by someone."
            : data.error || 'Could not send that request.'
        )
      } else {
        setRequestMsg('Request sent. They can accept it from their dashboard.')
      }
    } catch {
      setRequestMsg('Could not send that request.')
    }
    setRequesting(false)
  }

  const handleSubmitReview = async () => {
    setSubmittingReview(true)
    setReviewMsg(null)
    try {
      const res = await fetch('/api/pm/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, rating: reviewRating, comment: reviewComment }),
      })
      const data = await res.json()
      if (!res.ok) {
        setReviewMsg(data.error === 'You can only review a company currently managing your property' ? data.error : data.error || 'Could not save that review.')
      } else {
        setReviewMsg('Thanks for the review!')
        setShowReviewForm(false)
        // The profile data (reviews list, avgRating) was loaded once on
        // mount and never refetched -- a successful submit updated the row
        // server-side (confirmed: avgRating and reviewerFirstName list did
        // change) but the page kept showing the stale pre-submit list and
        // average, which read as a silent failure right next to "Thanks for
        // the review!".
        fetch(`/api/pm/profile/${slug}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((fresh) => fresh && setProfile(fresh))
          .catch(() => {})
      }
    } catch {
      setReviewMsg('Could not save that review.')
    }
    setSubmittingReview(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] px-6 py-20 text-center text-white/40">Loading…</div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] px-6 py-20 text-center">
        <p className="text-white/60 mb-4">That property manager's profile wasn't found.</p>
        <Link href="/property-managers/directory" className="text-[#12A5A9] text-sm font-semibold hover:underline">
          Browse the directory →
        </Link>
      </div>
    )
  }

  return (
    <div className="marketing-page min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <div className="flex items-center gap-6">
          <GoogleTranslateToggle />
          <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition">Sign in</Link>
          <MagneticLink
            href="/signup?role=landlord"
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-90"
          >
            Get started
          </MagneticLink>
        </div>
      </nav>

      <section className="max-w-2xl mx-auto px-6 pt-16 pb-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mx-auto mb-5">
          <BuildingIcon className="w-7 h-7 text-[#12A5A9]" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">{profile.name}</h1>
        {profile.pitch && <p className="text-white/60 max-w-lg mx-auto mb-5">{profile.pitch}</p>}

        <div className="flex items-center justify-center gap-5 text-sm text-white/50 mb-8">
          <span>{profile.clientCount} client{profile.clientCount === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>{profile.unitCount} unit{profile.unitCount === 1 ? '' : 's'} managed</span>
          {profile.avgRating !== null && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <StarIcon className="w-4 h-4 text-yellow-400" /> {profile.avgRating.toFixed(1)} ({profile.reviews.length})
              </span>
            </>
          )}
        </div>

        {isOwnProfile ? (
          <Link
            href="/landlord/pm"
            className="text-[#12A5A9] font-semibold px-7 py-3.5 rounded-full border border-[#12A5A9]/30 hover:bg-white/5 transition inline-block"
          >
            This is your profile — manage it →
          </Link>
        ) : isLandlord ? (
          <div className="flex flex-col items-center gap-2">
            <RippleButton
              onClick={handleRequest}
              disabled={requesting}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-7 py-3.5 rounded-full hover:opacity-90 disabled:opacity-50"
            >
              {requesting ? 'Sending…' : `Request to be managed by ${profile.name}`}
            </RippleButton>
            {requestMsg && <p className="text-white/50 text-sm">{requestMsg}</p>}
          </div>
        ) : loggedInOtherRole ? (
          <p className="text-white/50 text-sm max-w-xs mx-auto">
            Only a landlord account can request a property manager. You&apos;re signed in as a {loggedInOtherRole}
            {' — '}
            <Link href="/login" className="text-[#12A5A9] hover:underline">
              sign in with a landlord account
            </Link>{' '}
            or{' '}
            <Link href="/signup?role=landlord" className="text-[#12A5A9] hover:underline">
              create one
            </Link>{' '}
            to request {profile.name}.
          </p>
        ) : (
          <MagneticLink
            href={`/signup?role=landlord&pmSlug=${slug}`}
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-7 py-3.5 rounded-full hover:opacity-90 inline-block"
          >
            Request to be managed by {profile.name}
          </MagneticLink>
        )}
        {!isOwnProfile && (
          <p className="text-white/30 text-xs mt-4 flex items-center justify-center gap-1.5">
            <ShieldIcon className="w-3.5 h-3.5" /> You stay the owner. Remove their access anytime.
          </p>
        )}
      </section>

      {isLandlord && !isOwnProfile && (
        <section className="max-w-2xl mx-auto px-6 pb-8">
          {!showReviewForm ? (
            <button onClick={() => setShowReviewForm(true)} className="text-[#12A5A9] text-sm font-semibold hover:underline">
              Managed by {profile.name}? Leave a review →
            </button>
          ) : (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setReviewRating(n)} aria-label={`${n} stars`}>
                    <StarIcon className={`w-6 h-6 ${n <= reviewRating ? 'text-yellow-400' : 'text-white/15'}`} />
                  </button>
                ))}
              </div>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="How has it gone working with them? (optional)"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#12A5A9]/50 mb-3"
              />
              <p className="text-white/30 text-xs mb-3">Your rating and comment are shown publicly on this page with your first name. Your full name and account are never shown.</p>
              <div className="flex items-center gap-3">
                <RippleButton
                  onClick={handleSubmitReview}
                  disabled={submittingReview}
                  className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2 rounded-xl disabled:opacity-50"
                >
                  {submittingReview ? 'Saving…' : 'Submit review'}
                </RippleButton>
                <button onClick={() => setShowReviewForm(false)} className="text-white/50 hover:text-white text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
          {reviewMsg && <p className="text-white/50 text-sm mt-3">{reviewMsg}</p>}
        </section>
      )}

      {profile.reviews.length > 0 && (
        <section className="max-w-2xl mx-auto px-6 pb-20">
          <h2 className="text-white font-semibold mb-4">What clients say</h2>
          <div className="space-y-3">
            {profile.reviews.map((r, i) => (
              <div key={i} className="bg-white/3 border border-white/8 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <Stars value={r.rating} />
                  <span className="text-white/30 text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="text-white/70 text-sm leading-relaxed mb-1.5">{r.comment}</p>}
                <p className="text-white/40 text-xs">{r.reviewerFirstName}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
