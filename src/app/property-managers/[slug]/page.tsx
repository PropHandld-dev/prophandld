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
import { resolveProfileStyle } from '@/lib/profileStyles'

type Profile = {
  name: string
  pitch: string | null
  clientCount: number
  unitCount: number
  avgRating: number | null
  licenseNumber: string | null
  insured: boolean
  yearsInBusiness: number | null
  specialties: string[]
  serviceZips: string[]
  pricingNote: string | null
  logoUrl: string | null
  coverUrl: string | null
  brandColor: string | null
  about: string | null
  website: string | null
  contactPhone: string | null
  contactEmail: string | null
  officeHours: string | null
  team: { name: string; role: 'admin' | 'staff' }[]
  reviews: { rating: number; comment: string | null; createdAt: string; reviewerFirstName: string }[]
}

const SPECIALTY_LABELS: Record<string, string> = {
  single_family: 'Single-family',
  multifamily: 'Multifamily',
  short_term: 'Short-term/vacation',
  commercial: 'Commercial',
  hoa: 'HOA',
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

  const look = resolveProfileStyle(profile.brandColor)

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

      {/* Hero: the PM's cover photo, or a slowly drifting gradient in their
          profile style, with a frosted card on top. Colors come only from
          resolveProfileStyle, never raw input. */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="relative h-52 sm:h-72 rounded-[28px] overflow-hidden border border-white/10" style={{ background: look.gradient }}>
          {profile.coverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 35%, ${look.stops[1]}55 100%)` }} />
            </>
          ) : (
            <>
              <span aria-hidden className="pm-blob absolute -top-1/3 -left-1/4 w-3/4 h-[140%] rounded-full blur-3xl opacity-80" style={{ background: look.stops[2] }} />
              <span aria-hidden className="pm-blob pm-blob-2 absolute -bottom-1/2 right-[-15%] w-2/3 h-[140%] rounded-full blur-3xl opacity-70" style={{ background: look.stops[1] }} />
              <span aria-hidden className="pm-blob pm-blob-3 absolute top-1/4 left-1/3 w-1/3 h-2/3 rounded-full blur-2xl opacity-50" style={{ background: look.stops[0] }} />
              <span aria-hidden className="absolute inset-0 opacity-[0.12] bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            </>
          )}
        </div>
      </div>

      <section className="max-w-2xl mx-auto px-5 -mt-20 sm:-mt-24 pb-10 text-center relative">
        <div className="rounded-[28px] border border-white/15 bg-[#0C1A2E]/75 backdrop-blur-2xl px-5 py-7 sm:px-10 sm:py-9 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.7)] mb-8">
          <div className="mx-auto mb-5 w-[88px] h-[88px] rounded-[22px] p-[3px]" style={{ background: look.gradient }}>
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logoUrl} alt={`${profile.name} logo`} className="w-full h-full rounded-[19px] object-cover bg-white" />
            ) : (
              <div className="w-full h-full rounded-[19px] bg-[#0C1A2E] flex items-center justify-center text-2xl font-bold" style={{ color: look.stops[2] }}>
                {profile.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3 text-balance">{profile.name}</h1>
          {profile.pitch && <p className="text-white/65 max-w-lg mx-auto text-base sm:text-lg leading-relaxed">{profile.pitch}</p>}

          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-7 max-w-md mx-auto">
            {[
              { value: String(profile.clientCount), label: profile.clientCount === 1 ? 'client' : 'clients' },
              { value: String(profile.unitCount), label: 'units managed' },
              { value: profile.avgRating !== null ? profile.avgRating.toFixed(1) : '—', label: profile.avgRating !== null ? `rating (${profile.reviews.length})` : 'no reviews yet', star: profile.avgRating !== null },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl bg-white/5 border border-white/10 py-3 px-2">
                <p className="text-xl sm:text-2xl font-bold tabular-nums flex items-center justify-center gap-1">
                  {m.value}
                  {m.star && <StarIcon className="w-4 h-4 text-yellow-400" />}
                </p>
                <p className="text-white/45 text-[11px] sm:text-xs mt-0.5 leading-tight">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust badges — license/insurance/track-record are the actual
            gates research shows landlords check before trusting a PM, not
            just a pitch line and a star rating. Each badge only renders if
            the PM actually filled it in; an org that skips all of these
            just sees the page as it looked before. */}
        {(profile.licenseNumber || profile.insured || profile.yearsInBusiness) && (
          <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
            {profile.licenseNumber && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-white/70 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                <ShieldIcon className="w-3.5 h-3.5 text-[#12A5A9]" /> Licensed · {profile.licenseNumber}
              </span>
            )}
            {profile.insured && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-white/70 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                <ShieldIcon className="w-3.5 h-3.5 text-[#12A5A9]" /> Insured (GL + E&O)
              </span>
            )}
            {profile.yearsInBusiness !== null && (
              <span className="text-xs font-medium text-white/70 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                {profile.yearsInBusiness} year{profile.yearsInBusiness === 1 ? '' : 's'} in business
              </span>
            )}
          </div>
        )}

        {(profile.specialties.length > 0 || profile.serviceZips.length > 0 || profile.pricingNote) && (
          <div className="max-w-md mx-auto bg-white/3 border border-white/8 rounded-2xl p-5 mb-8 text-left space-y-3">
            {profile.specialties.length > 0 && (
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-1.5">Specializes in</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.specialties.map((s) => (
                    <span key={s} className="text-xs font-medium text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-full px-2.5 py-1">
                      {SPECIALTY_LABELS[s] || s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {profile.serviceZips.length > 0 && (
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-1.5">Service area</p>
                <p className="text-white/70 text-sm">{profile.serviceZips.join(', ')}</p>
              </div>
            )}
            {profile.pricingNote && (
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-1.5">Typical pricing</p>
                <p className="text-white/70 text-sm">{profile.pricingNote}</p>
              </div>
            )}
          </div>
        )}

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
              style={{ background: look.gradient, boxShadow: `0 16px 40px -14px ${look.accent}` }}
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
            style={{ background: look.gradient, boxShadow: `0 16px 40px -14px ${look.accent}` }}
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

      {(profile.about || profile.website || profile.contactPhone || profile.contactEmail || profile.officeHours || profile.team.length > 0) && (
        <section className="max-w-2xl mx-auto px-6 pb-10 space-y-4">
          {profile.about && (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-2">About {profile.name}</h2>
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line">{profile.about}</p>
            </div>
          )}
          {(profile.website || profile.contactPhone || profile.contactEmail || profile.officeHours) && (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-3">Contact</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {profile.website && (
                  <div>
                    <dt className="text-white/40 text-xs font-semibold uppercase tracking-wide">Website</dt>
                    <dd>
                      <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow" className="text-[#12A5A9] hover:underline break-all">
                        {profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </dd>
                  </div>
                )}
                {profile.contactPhone && (
                  <div>
                    <dt className="text-white/40 text-xs font-semibold uppercase tracking-wide">Phone</dt>
                    <dd className="text-white/80 select-all">{profile.contactPhone}</dd>
                  </div>
                )}
                {profile.contactEmail && (
                  <div>
                    <dt className="text-white/40 text-xs font-semibold uppercase tracking-wide">Email</dt>
                    <dd className="text-white/80 select-all break-all">{profile.contactEmail}</dd>
                  </div>
                )}
                {profile.officeHours && (
                  <div>
                    <dt className="text-white/40 text-xs font-semibold uppercase tracking-wide">Office hours</dt>
                    <dd className="text-white/80">{profile.officeHours}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          {profile.team.length > 0 && (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-3">Team</h2>
              <div className="flex flex-wrap gap-3">
                {profile.team.map((m, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-white/4 border border-white/8 rounded-xl px-3 py-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: look.gradient }}
                    >
                      {m.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium leading-tight">{m.name}</p>
                      <p className="text-white/40 text-xs">{m.role === 'admin' ? 'Owner / admin' : 'Team member'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

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
