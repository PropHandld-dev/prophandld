'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getAccountRole } from '@/lib/accountRole'
import { MagneticLink } from '@/components/MagneticLink'
import { ScrollReveal } from '@/components/ScrollReveal'
import { DollarSignIcon, AlertTriangleIcon, FileTextIcon, WrenchIcon, CalendarIcon, CheckCircleIcon, MessageCircleIcon, LockIcon, StarIcon, GlobeIcon, ShieldIcon, BuildingIcon, MenuIcon, XIcon } from '@/components/icons'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { RoleShowcase } from '@/components/RoleShowcase'
import { FeatureTourCarousel } from '@/components/FeatureTourCarousel'
import { HowItWorksTracker, NotificationPreview } from '@/components/LandingTracker'
import { BellIcon, ReceiptIcon } from '@/components/icons'
import { LandingHelpWidget } from '@/components/LandingHelpWidget'
import { EarlyAccessSection } from '@/components/EarlyAccessSection'
import { AiAssistShowcase } from '@/components/AiAssistShowcase'

// Trimmed from 13 to 10 (2026-11) -- "Job chat" and "Direct messages" were
// two cards saying "you can message people here," and "Verified
// contractors" / "Real reviews" were two cards about how to tell a good
// contractor from a bad one. Merged rather than cut, so nothing a visitor
// relied on actually disappeared, it just stopped being three near-duplicate
// cards to scroll past.
const OPERATIONS_FEATURES = [
  { icon: DollarSignIcon, title: 'Online rent', desc: 'Rent tracks itself every month. Renters pay by bank transfer or debit card. Edit any month, add a credit, or refund an overpayment in a tap.' },
  { icon: BellIcon, title: 'Instant alerts', desc: "The right person hears at the right moment: a new bid, a proposed time, work ready for review. By email, push notification, or text, pick what works for you in Notifications settings." },
  { icon: ReceiptIcon, title: 'Receipts & records', desc: 'Every rent and repair payment gets a receipt, emailed to you and saved on the record.' },
  { icon: MessageCircleIcon, title: 'Messaging, not phone numbers', desc: "Every job has one thread for the landlord, renter and contractor. Need to reach someone outside a job? Message any tenant, or a contractor you've worked with before, directly." },
  { icon: CalendarIcon, title: 'Schedule calendar', desc: 'Confirmed visits, rent due dates, and expiring compliance items, all in one month view. Rent and compliance reminders both go out automatically, on a schedule you set.' },
  { icon: FileTextIcon, title: 'Documents vault', desc: 'Leases, deeds, insurance, inspection reports. Tenants can upload their own too, like proof of renters insurance, shared with you or kept private.' },
  { icon: WrenchIcon, title: 'Systems & appliances', desc: 'Track HVAC, water heaters, roofs, and panels with install dates and service history.' },
  { icon: ShieldIcon, title: 'Pick a contractor you can trust', desc: "License and insurance submitted for review, plus real ratings from landlords and tenants after every job, the actual feedback, not just a star count." },
  { icon: AlertTriangleIcon, title: 'Emergency priority', desc: 'Flag something that cannot wait and matching contractors are alerted with an emergency label.' },
  { icon: LockIcon, title: 'Dispute protection', desc: "Hopefully you never need it. After a landlord approves, any side has 48 hours to flag a problem and Prophandld steps in." },
]

// What Prophandld actually replaces, one honest pain point at a time — real
// alternatives to running rentals through this app, not a vague tagline.
// Rotates on its own; a reduced-motion visitor just sees the first one, held.
const HERO_PHRASES = ['not a spreadsheet.', 'not a group text.', 'not a stack of receipts.', 'not a missed call.']

function RotatingHeroPhrase() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setIndex((i) => (i + 1) % HERO_PHRASES.length), 2600)
    return () => clearInterval(id)
  }, [])

  return (
    <span
      key={index}
      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] bg-clip-text text-transparent inline-block motion-safe:animate-[fadeIn_0.4s_ease-out]"
    >
      {HERO_PHRASES[index]}
    </span>
  )
}

// Structured data for search engines — purely additive, invisible to a
// visitor, and free in the literal sense (no ad spend). Only states facts
// the rest of the page already claims: the free-tier offer (real pricing
// now lives at /pricing, matching pricingTiers.ts) and no
// aggregateRating/review (would be fabricated — nothing like that
// exists pre-launch, same reasoning the team already applied to the trust
// section below instead of fake testimonials).
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://www.prophandld.com/#organization',
      name: 'Prophandld',
      url: 'https://www.prophandld.com',
      logo: 'https://www.prophandld.com/icon-192.png',
      slogan: 'Your Property. Handled.',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Prophandld',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: 'The software landlords and property managers use to track properties and tenants, get contractor bids through sealed bidding, and collect rent online, all in one dashboard.',
      url: 'https://www.prophandld.com',
      publisher: { '@id': 'https://www.prophandld.com/#organization' },
      areaServed: { '@type': 'City', name: 'Philadelphia' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free for a single rental unit' },
    },
  ],
}

export default function LandingPage() {
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Mobile only (desktop's 4-column grid already shows everything at
  // once): a phone visitor flagged this as "we keep scrolling" -- 10
  // full-height cards stacked one per row is a lot of scroll for a
  // section most people skim rather than read every word of.
  const [showAllFeatures, setShowAllFeatures] = useState(false)
  // Mobile only: once the hero (with its own "Get started free" button)
  // scrolls out of view, the primary CTA otherwise disappears entirely
  // until a visitor scrolls all the way back to the top -- on a page
  // this long, that's most of the scroll. A sticky bottom bar keeps it
  // one thumb-tap away. IntersectionObserver instead of a scroll
  // listener: no per-frame work, just one callback when the hero crosses
  // the viewport edge.
  const heroRef = useRef<HTMLDivElement>(null)
  const [heroVisible, setHeroVisible] = useState(true)

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A returning, already-signed-in visitor (especially one who installed
  // this as a Home Screen app) shouldn't have to look at a pitch for a
  // product they already use. getSession() reads the locally persisted
  // session with no network round trip, so this resolves fast enough not
  // to be a visible flash for the far more common case: someone who isn't
  // signed in at all, who this redirect never touches.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const role = getAccountRole(session?.user)
      if (role === 'landlord') router.replace('/landlord')
      else if (role === 'renter') router.replace('/renter')
      else if (role === 'contractor') router.replace('/contractor')
    })
  }, [router])

  return (
    <div className="marketing-page min-h-screen bg-[#0C1A2E] text-white relative">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      {/* Nav — sticky wrapper holds both the row and the mobile dropdown
          together, so the dropdown stays attached directly under the nav
          row at any scroll position instead of scrolling away on its own. */}
      <div className="sticky top-0 z-10 bg-[#0C1A2E]/90 backdrop-blur-sm">
        <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLink className="gap-2.5">
              <Logo className="w-[30px] h-[30px]" />
              <span className="font-bold text-lg tracking-tight">Prophandld</span>
            </BrandLink>
            <span className="hidden md:inline text-white/50 text-xs border-l border-white/15 pl-2.5 ml-0.5">Your Property. Handled.</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            <a href="#how-it-works" className="text-sm text-white/50 hover:text-white transition hidden sm:block">How it works</a>
            <a href="#pricing" className="text-sm text-white/50 hover:text-white transition hidden sm:block">Pricing</a>
            <a href="#roles" className="text-sm text-white/50 hover:text-white transition hidden sm:block">Who it&apos;s for</a>
            <Link href="/contractors" className="text-sm text-white/50 hover:text-white transition hidden sm:block">For contractors</Link>
            <Link href="/property-managers" className="text-sm text-white/50 hover:text-white transition hidden sm:block">For property managers</Link>
            {/* Mobile: dropped from this row entirely (moved into the
                hamburger panel below) rather than just shrunk further --
                a live mobile screenshot at 390px showed it visually
                colliding with "Get started" and the brand wordmark once
                the hamburger button was added, with no more room left to
                squeeze. Still always visible on desktop. */}
            <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition whitespace-nowrap shrink-0 hidden sm:block">
              Sign in
            </Link>
            <MagneticLink
              href="/signup"
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-90 whitespace-nowrap shrink-0"
            >
              Get started
            </MagneticLink>
            {/* Mobile-only hamburger: the five links above are hidden below
                sm (no room in the tight phone nav row), so this is the
                only way to reach How it works / Pricing / Who it's for /
                For contractors / For property managers on a phone. */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              className="sm:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white hover:border-white/30 transition"
            >
              {mobileMenuOpen ? <XIcon className="w-4 h-4" /> : <MenuIcon className="w-4 h-4" />}
            </button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-white/8 px-6 py-4 flex flex-col gap-1">
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">How it works</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">Pricing</a>
            <a href="#roles" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">Who it&apos;s for</a>
            <Link href="/contractors" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">For contractors</Link>
            <Link href="/property-managers" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">For property managers</Link>
            <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium border-t border-white/8 mt-1 pt-3.5">Sign in</Link>
          </div>
        )}
      </div>

      <main>
      {/* Contractor callout — the nav link to /contractors is desktop-only
          (no room for it in the tight mobile nav row), and the contractor
          role card further down the page is well past the fold on a phone.
          This is the guaranteed-visible path for a first-time mobile
          visitor who is actually a contractor, not a landlord: seen the
          instant the page loads, no scrolling required. */}
      <Link
        href="/contractors"
        className="block bg-gradient-to-r from-[#0A7B7E]/15 to-[#12A5A9]/15 border-b border-[#12A5A9]/20 px-6 py-2.5 text-center hover:from-[#0A7B7E]/20 hover:to-[#12A5A9]/20 transition"
      >
        <span className="text-xs sm:text-sm text-[#12A5A9] font-medium">
          Contractor? Free local leads, no cut. See how it works →
        </span>
      </Link>

      {/* Hero */}
      <section ref={heroRef} className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center overflow-hidden">
        <div aria-hidden className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#0A7B7E]/20 blur-3xl -z-10 motion-safe:animate-[drift_9s_ease-in-out_infinite]" />
        <div aria-hidden className="absolute -top-20 -right-24 w-80 h-80 rounded-full bg-[#12A5A9]/20 blur-3xl -z-10 motion-safe:animate-[drift_11s_ease-in-out_infinite_1s]" />

        {/* A second external review (2026-11-10) flagged "Coming soon" as
            its own problem: it contradicts the very next CTA ("Get started
            free"), which is real and already works — signup, dashboards,
            and every non-payment feature are live today. Rather than
            revert to the flatly-misleading "Now onboarding" this replaced
            on 2026-11-05 (which implied live payments too), this says both
            true things at once: you can onboard now, Stripe payments
            specifically aren't live yet. Flip to a plain "Now onboarding"
            once they are. Mirrored on contractors/page.tsx. */}
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          Onboarding Philadelphia landlords now — live payments coming soon
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Run your rentals,<br />
          <RotatingHeroPhrase />
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
          Prophandld gives landlords and property managers one place to run
          it all. Simple enough to start with a couple of
          units, built to keep up as your portfolio grows. Track your
          properties and tenants, get competitive contractor bids through
          sealed bidding, and collect rent online, all in one place.
        </p>
        <div className="flex items-center justify-center gap-4">
          <MagneticLink
            href="/signup"
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-7 py-3.5 rounded-full hover:opacity-90"
          >
            Get started free
          </MagneticLink>
          <Link
            href="/login"
            className="text-white font-semibold px-7 py-3.5 rounded-full border border-white/15 hover:border-white/30 transition"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Product preview */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <ScrollReveal>
          <RoleShowcase />
        </ScrollReveal>
      </section>

      {/* Safe Healthy Homes legislation (Bill 250329-AA) — a real, dated
          deadline for Philadelphia landlords, deliberately given its own
          prominent section rather than buried as one card among many.
          Facts below corrected 2026-11-10 after a direct read of the bill
          text flagged the original wording as going further than the bill
          actually says (missing the 30-day fix applying only to serious
          violations, the "or actual damages, whichever is more" clause,
          the 15-day renewal grace period, and that it's one violation, not
          one per day) — see that review for the specifics. "Safe Healthy
          Homes" is the name used in public reporting/advocacy for this
          legislation, not its own formal title, so it's paired with the
          bill number rather than stated alone. */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="relative overflow-hidden bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-white/3 border border-[#12A5A9]/25 rounded-3xl p-8 sm:p-12">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
                Philadelphia landlords
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">
                Philadelphia&apos;s Safe Healthy Homes legislation (Bill 250329-AA) took effect November 1, 2026.
              </h2>
              <p className="text-white/60 leading-relaxed mb-8 max-w-2xl">
                Let a license lapse past the 15-day renewal grace period and you can&apos;t legally collect
                rent, and an unresolved serious violation can cost you that same right even with an active
                license. Tenants can sue for at least $1,000 per violation, or actual damages if higher, plus
                attorney&apos;s fees. Prophandld tracks your license and certificate dates and reminds you
                before they expire, not after an inspector or a lawsuit tells you.
              </p>
              <div className="grid sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white font-bold text-lg">30 days</p>
                  <p className="text-white/50 text-xs mt-1">to correct a serious cited violation, or you can lose the right to collect rent</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white font-bold text-lg">15-day grace period</p>
                  <p className="text-white/50 text-xs mt-1">to renew a lapsed license before you lose the right to collect rent</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white font-bold text-lg">$1,000+</p>
                  <p className="text-white/50 text-xs mt-1">per violation a tenant can sue for, plus attorney&apos;s fees</p>
                </div>
              </div>
              <Link
                href="/signup?role=landlord"
                className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 transition"
              >
                Set up compliance tracking →
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Feature tour */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <h2 className="text-3xl font-bold text-center mb-3 text-white">See what you actually get</h2>
          <p className="text-white/50 text-center max-w-xl mx-auto mb-10">A real feature tour, not a highlight reel. Switch between landlord and contractor to see it from either side.</p>
          <FeatureTourCarousel />
        </ScrollReveal>
      </section>

      {/* Beyond maintenance */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Beyond maintenance: the boring stuff, handled</h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              Prophandld replaces the whole spreadsheet, not just the group text with your contractor.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {OPERATIONS_FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className={`bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200 ${
                  i >= 4 && !showAllFeatures ? 'max-sm:hidden' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-4">
                  <Icon className="w-4 h-4 text-[#12A5A9]" />
                </div>
                <h3 className="text-white font-semibold mb-1.5">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowAllFeatures((v) => !v)}
            className="sm:hidden mx-auto mt-5 flex items-center gap-1.5 text-[#12A5A9] text-sm font-semibold"
          >
            {showAllFeatures ? 'Show less' : `Show all ${OPERATIONS_FEATURES.length} features`}
          </button>
        </ScrollReveal>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]"
      >
        <ScrollReveal className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-3 text-white">How it works</h2>
          <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">From a report to a receipt, everyone sees the same job and the same status.</p>
          <HowItWorksTracker />
        </ScrollReveal>
      </section>

      {/* Notifications */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3">Always in the loop, never buried</h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              Every step of a job sends one clear update: what changed and what to do next. No 9 p.m. “any update?” texts. Contractors hear about new jobs only when a landlord opens bidding, and only for their trade and area.
            </p>
          </div>
          <NotificationPreview />
        </ScrollReveal>
      </section>

      {/* For each role */}
      <section id="roles" className="max-w-5xl mx-auto px-6 py-20">
        <ScrollReveal>
        <h2 className="text-3xl font-bold text-center mb-3 text-white">Built for landlords, with everyone else looped in</h2>
        <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">
          You run the show. Tenants report issues in seconds, contractors bid fair and get picked on merit. No spreadsheet, no group texts.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="bg-white/3 border border-[#12A5A9]/30 rounded-2xl p-7 hover:border-[#12A5A9]/50 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs font-semibold text-[#12A5A9] bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 px-2.5 py-1 rounded-full">Landlords</span>
            <h3 className="text-white font-bold text-lg mt-4 mb-2">Bring your own guy. Or find a new one.</h3>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              Already have a plumber or electrician you trust? Invite them in
              directly, no bidding required, everything from quotes to
              payments stays in one dashboard. Need someone new? Open the job
              to sealed bidding instead. Either way, you also get rent
              collection, leases, and compliance tracking in the same place.
            </p>
            <Link href="/signup?role=landlord" className="text-[#12A5A9] text-sm font-semibold hover:underline">
              Sign up as a landlord →
            </Link>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-7 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs font-semibold text-[#12A5A9] bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 px-2.5 py-1 rounded-full">Renters</span>
            <h3 className="text-white font-bold text-lg mt-4 mb-2">Get things fixed, fast</h3>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              Report an issue in seconds, message your landlord directly, and
              pay rent online, with no more checks, cash, or digging through old
              text threads. Add your own documents too, like proof of renters
              insurance, kept private or shared with your landlord.
            </p>
            <Link href="/signup?role=renter" className="text-[#12A5A9] text-sm font-semibold hover:underline">
              Sign up as a renter →
            </Link>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-7 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs font-semibold text-[#12A5A9] bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 px-2.5 py-1 rounded-full">Contractors</span>
            <h3 className="text-white font-bold text-lg mt-4 mb-2">Free leads. No cut.</h3>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              Real jobs near you, sent straight to your phone for your trade.
              Submit a sealed bid and get picked on merit, not by who lowballed
              hardest. Approval makes payment due right away, straight from the landlord via Stripe.{' '}
              <span className="text-white/70 font-medium">No signup fee, no monthly fee, no cut of your bid.</span>
            </p>
            <Link href="/contractors" className="text-[#12A5A9] text-sm font-semibold hover:underline">
              See how it works for contractors →
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>

      {/* Property managers — given the same dedicated weight as the Safe
          Healthy Homes section further up, rather than one card among
          four in the roles grid above (which is where it lived before —
          both Joshua and Nevin said that wasn't enough to register PM as
          a real, separate audience on a first scroll). */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="relative overflow-hidden bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-white/3 border border-[#12A5A9]/25 rounded-3xl p-8 sm:p-12">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              Run a property management company?
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight max-w-2xl">
              All your clients. One login.
            </h2>
            <p className="text-white/60 leading-relaxed mb-8 max-w-2xl">
              Manage every landlord client&apos;s properties, maintenance, and
              compliance from a single dashboard, with a portfolio switcher
              per client and approval thresholds so owners sign off on
              bigger repairs automatically, no phone call required.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <BuildingIcon className="w-4 h-4 text-[#12A5A9] mb-2" />
                <p className="text-white font-semibold text-sm">Every client, one login</p>
                <p className="text-white/50 text-xs mt-1">A portfolio switcher across every landlord you manage, no separate spreadsheets per owner</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <ShieldIcon className="w-4 h-4 text-[#12A5A9] mb-2" />
                <p className="text-white font-semibold text-sm">Approval thresholds built in</p>
                <p className="text-white/50 text-xs mt-1">Set a dollar limit per client. Anything over it waits for their own sign-off, logged automatically</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <WrenchIcon className="w-4 h-4 text-[#12A5A9] mb-2" />
                <p className="text-white font-semibold text-sm">A real contractor network</p>
                <p className="text-white/50 text-xs mt-1">Sealed bidding or your own trusted contractor, with quotes and payment in the same place</p>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <Link
                href="/property-managers"
                className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 transition"
              >
                See how it works for property managers →
              </Link>
              <Link href="/signup?role=landlord&intent=property_manager" className="text-white/70 text-sm font-semibold hover:text-white transition">
                Get started
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Launch event interest */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <ScrollReveal>
          <EarlyAccessSection />
        </ScrollReveal>
      </section>

      {/* Comparison — deliberately never names a specific competitor
          (Yelp, Angi, etc). Comparative advertising naming a real
          competitor by name is generally legal in the US (nominative fair
          use) IF every claim about them is precisely accurate — but that's
          exactly the exposure: a specific factual claim about a named
          competitor's current business model that turns out imprecise is
          a false-advertising problem, not just a trademark one. With no
          attorney review in place yet, "the old way" makes the same point
          with nobody who could ever claim we got a fact about their
          business wrong. */}
      <section className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]">
        <ScrollReveal className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-3 text-white">The quotes you remember, without the chaos you don&apos;t</h2>
          <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">
            You&apos;ve probably requested quotes online before, multiple contractors, real competition. Here&apos;s the part that experience usually leaves out.
          </p>
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-3 text-xs font-semibold uppercase tracking-wide text-white/40 px-5 py-3 border-b border-white/8">
              <span></span>
              <span>The old way</span>
              <span className="text-[#12A5A9]">Prophandld</span>
            </div>
            {[
              { label: 'Getting quotes', typical: "Contractors call and text you directly, you're juggling comparisons yourself.", prophandld: 'Every bid lands in one dashboard, side by side.' },
              { label: 'Bidding fairness', typical: "Contractors can tell roughly how many others are bidding, some don't bother competing seriously.", prophandld: "Sealed bidding, nobody sees another's number, so you get real prices, not posturing." },
              { label: 'What it costs the contractor', typical: 'Many apps charge contractors per lead, win or not.', prophandld: 'Free during our Philadelphia pilot, so the contractors who show up actually want the job.' },
              { label: 'After you pick someone', typical: "You're often on your own, no tracking, no proof of work, no built-in payment.", prophandld: 'Scheduling, before/after photos, and payment all stay in one place.' },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                className={`px-5 py-4 text-sm sm:grid sm:grid-cols-3 sm:gap-2 sm:items-start ${i !== arr.length - 1 ? 'border-b border-white/8' : ''}`}
              >
                <span className="text-white font-medium block mb-2 sm:mb-0">{row.label}</span>
                <span className="text-white/40 block mb-1 sm:mb-0">
                  <span className="sm:hidden text-white/30 text-xs uppercase tracking-wide block mb-0.5">The old way</span>
                  {row.typical}
                </span>
                <span className="text-white/90 flex items-start gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0 mt-0.5" />
                  <span>
                    <span className="sm:hidden text-[#12A5A9] text-xs uppercase tracking-wide block mb-0.5">Prophandld</span>
                    {row.prophandld}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* Trust/security — pre-launch means no real customer logos or
          testimonials exist yet, and claiming them would do more damage
          than having none (research: fabricated social proof at true
          pre-launch stage actively erodes trust vs. stage-appropriate
          transparency). Every claim below is a real, shipped mechanism —
          not a number or a name, which would need faking right now. */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3">Built to protect your money, not just move it</h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              We&apos;re a new platform, so instead of asking you to trust a logo wall, here&apos;s exactly what&apos;s actually built in.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-4">
                <LockIcon className="w-4 h-4 text-[#12A5A9]" />
              </div>
              <h3 className="text-white font-semibold mb-1.5">Payments run through Stripe</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                The same infrastructure banks and major platforms rely on. Once a payment is sent, Stripe routes it automatically to the recipient&apos;s own account — Prophandld never keeps it or decides when it moves. Instant bank verification for supported accounts, not always the multi-day microdeposit wait you&apos;re used to.
              </p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-4">
                <ShieldIcon className="w-4 h-4 text-[#12A5A9]" />
              </div>
              <h3 className="text-white font-semibold mb-1.5">Sealed bidding, for real</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                No contractor ever sees another contractor&apos;s bid. Not a lower number, not even that one exists.
              </p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-4">
                <AlertTriangleIcon className="w-4 h-4 text-[#12A5A9]" />
              </div>
              <h3 className="text-white font-semibold mb-1.5">A real dispute window</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                48 hours after a job&apos;s approved for either side to flag a problem, and the job itself pauses for review if one comes in. Not a policy, an actual pause.
              </p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-4">
                <CheckCircleIcon className="w-4 h-4 text-[#12A5A9]" />
              </div>
              <h3 className="text-white font-semibold mb-1.5">Payouts pause if something looks off</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                If a payout bank account changes, payouts automatically freeze for 48 hours and we alert the account owner, in case it wasn&apos;t them.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* Pricing teaser — real numbers, matches src/lib/pricingTiers.ts and
          the full breakdown at /pricing exactly; keep both in sync if
          those tiers ever change. A real free tier, flat monthly plans
          through 25 units, then a flat $1.75/unit rate above that
          (simplified 2026-10-24 from an earlier three-step rate). */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 sm:p-12 text-center">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              Simple, graduated pricing
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Free to try. Simple after that.</h2>
            <p className="text-white/50 max-w-xl mx-auto leading-relaxed mb-2">
              Your first unit is free, full stop. Then <strong className="text-white/80">$19.99/month</strong> for
              2–4 units, <strong className="text-white/80">$39.99</strong> for 5–10, <strong className="text-white/80">$79.99</strong> for
              11–25, flat rates, not per-unit. Past 25 units, $79.99 plus $1.75 for every unit over 25.
            </p>
            <p className="text-white/50 max-w-xl mx-auto leading-relaxed mb-6">
              Renters and contractors pay Prophandld nothing.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <MagneticLink
                href="/signup?role=landlord"
                className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 transition"
              >
                Try it free →
              </MagneticLink>
              <Link
                href="/pricing"
                className="text-[#12A5A9] text-sm font-semibold hover:underline"
              >
                See the full pricing breakdown →
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* AI Assist — an optional, landlord-paid add-on, not folded into the
          base plan or hidden behind a "coming soon" placeholder (fixed
          2026-10-31: the old /pricing page literally still said "coming in
          a later phase" for a different, never-built feature, months after
          this one actually shipped). Everything claimed below is a real,
          shipped, live-tested capability, not a roadmap item. Copy
          deliberately never compares against "other AI apps" — the pitch
          is what it does with your actual data, not a category claim.
          Placed right after the base plan's own pricing section, not
          earlier on the page (fixed 2026-11-01: a first-time visitor
          scrolling straight down used to hit a full AI Assist price grid
          before ever learning what the app itself costs — confusing on its
          own terms, since "$4.99" read like it might BE the price). */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              Prophandld AI &middot; optional add-on, on top of the plan above
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">
              Meet Prophandld AI, the AI that&apos;s actually read your lease, not the internet&apos;s best guess.
            </h2>
            <p className="text-white/50 max-w-2xl mx-auto leading-relaxed">
              Ask about your lease or a document you&apos;ve uploaded, and it&apos;s built to answer
              from that real file, not a guess, pointing you to it when it can, and saying so
              plainly when it can&apos;t find an answer there, rather than inventing one. Other
              questions use your real account details, not a document, which it&apos;ll also tell
              you. Like any AI, it can still get things wrong, so always use your own judgment
              before acting on something that matters.
            </p>
          </div>

          <AiAssistShowcase />
          <p className="text-white/40 text-xs text-center max-w-xl mx-auto leading-relaxed mt-4">
            It&apos;s built to never give repair instructions for anything electrical, gas, or
            structural. Those should always go to a contractor. In a genuine emergency it can point
            you to safety basics (get out, call for help), but it&apos;s not a substitute for calling
            911 or your gas company.
          </p>

          <div className="mt-16 max-w-3xl mx-auto bg-white/3 border border-white/8 rounded-2xl p-6 sm:p-8">
            <h3 className="text-white font-semibold text-center mb-2">One subscription, two people benefit</h3>
            <p className="text-white/50 text-sm text-center leading-relaxed max-w-xl mx-auto mb-6">
              This is separate from, and in addition to, the plan above. You&apos;re the one who
              turns it on and pays for it. The moment you do, every tenant on your properties gets
              it too, automatically, at no extra cost to them. Turn it off, and it turns off for
              them at the same time, nothing lingers.
            </p>
            <div className="grid sm:grid-cols-5 gap-2.5 text-center">
              {[
                ['1 unit', '$4.99'],
                ['2–4 units', '$9.99'],
                ['5–10 units', '$14.99'],
                ['11–25 units', '$24.99'],
                ['26+ units', '+$0.50/unit'],
              ].map(([range, price]) => (
                <div key={range} className="bg-white/[0.03] border border-white/8 rounded-xl py-3">
                  <p className="text-white font-bold text-sm">{price}</p>
                  <p className="text-white/40 text-[11px] mt-0.5">{range}</p>
                </div>
              ))}
            </div>
            <p className="text-white/40 text-xs text-center mt-5">
              14-day free trial, cancel anytime. Turn it on from your profile whenever you&apos;re ready.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* FAQ */}
      <section
        className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]"
      >
        <ScrollReveal className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Common questions</h2>
          <div className="space-y-3">
            {[
              { q: 'Is this just for finding contractors?', a: "No. Prophandld is built to replace the spreadsheet. Track every property, unit, and tenant, handle maintenance end to end with sealed bidding, and collect rent, all in one dashboard. Your spreadsheet can finally retire." },
              { q: 'What does it cost?', a: "Your first unit is free. Then $19.99/month for 2–4 units, $39.99 for 5–10, $79.99 for 11–25, flat rates, not per-unit. Past 25 units, $79.99 plus $1.75 for every unit over 25. Prophandld AI is a separate optional add-on from $4.99/month if you want it. See the full breakdown and try the calculator at /pricing. Contractors pay nothing during this pilot program: no signup fee, no monthly fee, no cut of a bid. If that ever changes, contractors get at least 60 days' written notice first, and it never applies retroactively to work already bid, scheduled, or completed." },
              { q: 'What does Prophandld AI actually do?', a: "It handles the parts of this job that eat your evenings: talks a tenant through a safe fix before a contractor's ever needed (never anything electrical, gas, or structural), reads an uploaded lease or compliance document straight into the right fields, answers a renter's own lease questions directly, flags a compliance gap before it becomes a fine, drafts the routine messages you'd otherwise type yourself, and gives you a one-line morning briefing of what actually needs your attention. It's an optional add-on billed to you, the landlord, from $4.99/month with a 14-day free trial. Turn it on and your tenants get it too, automatically, at no extra cost to them." },
              { q: 'How does sealed bidding actually work?', a: "Contractors near the property are alerted when you open a job for bids. They submit their price privately and never see what anyone else bid. You choose who you trust, not just the lowest number. No bidding wars, no “my cousin quoted less”." },
              { q: 'Do I have to use a contractor?', a: "No. For anything small enough to handle yourself, mark it fixed directly, no bidding required. Contractors are there for when you want one, not a requirement for every repair." },
              { q: "What if the contractor's price changes?", a: 'If a contractor needs to adjust their price once work has started, they show you the new labor and parts breakdown, and you approve it before they move forward. No surprise invoices.' },
              { q: 'How do rent and contractor payments work?', a: "Renters pay rent by bank transfer or debit card, not credit cards, so nobody goes into card debt to make rent — the bank transfer processing fee is shown to, and paid by, the renter, not the landlord. For a contractor, a landlord reviews and approves a finished job (or it auto-approves after 3 days if they don't act, so a contractor isn't left waiting), approving makes payment due, and the landlord then completes an actual payment step by card or bank transfer, which is what actually releases it; the landlord absorbs that processing fee so the contractor always receives their full agreed amount. Everything runs through Stripe, the same infrastructure banks and major platforms rely on, and Stripe routes the money automatically to the person being paid — Prophandld never keeps it or decides when it moves." },
              { q: 'How will I know when something happens?', a: "Email, push, and text, your choice, not one primary channel with the others as an afterthought. Every step of a job (a bid arrives, a time is proposed or confirmed, work is ready for review) emails you and, if you've added Prophandld to your phone's Home Screen, pushes an instant alert too. Opt in to text messages for the same key moments from your Notifications settings." },
              { q: 'Do I get receipts and records?', a: 'Yes. Every rent payment and every contractor payment gets a receipt, emailed to you and saved on the job or rent record, so finding one later is a lookup, not a hunt.' },
              { q: 'What if a contractor cancels?', a: "The job reopens for sealed bids, nearby contractors are alerted again, and the landlord and renter are told. Photos, notes, and other bids stay put." },
              { q: "What if something isn't right after the job?", a: 'After the landlord approves, any side has 48 hours to raise a dispute. The job pauses while the Prophandld team reviews it. If nobody responds, finished work is approved automatically after 3 days so contractors are not left waiting.' },
              { q: 'Is Prophandld available in my area?', a: "Onboarding landlords in the Philadelphia area now, with more markets opening after that." },
              { q: "What is Philadelphia's Safe Healthy Homes legislation?", a: "Bill 250329-AA, which took effect November 1, 2026. It requires serious cited violations to be corrected within 30 days or a landlord can lose the right to collect rent, ties rent collection to having a valid rental license (with a 15-day grace period to renew a lapsed one), and lets tenants sue for at least $1,000 per violation, or actual damages if higher, plus attorney's fees. Prophandld tracks your license and certificate dates and reminds you before they expire." },
              { q: 'Does it work in Spanish?', a: 'The whole app does, not a translated homepage that quietly drops you back into English the moment you sign in. Switch anytime from your profile.' },
              { q: 'Can I use Prophandld as more than one role?', a: "Yes. If you're a landlord who also does contract work, or a renter who's also a landlord, link a second profile from your account menu and switch between dashboards instantly, no second signup, no second password." },
              { q: 'Can someone else help manage my properties?', a: "Yes, two ways. Invite a business partner as a co-owner from your profile, and they get your own full access to one portfolio alongside you. If you're hiring a property management company instead, they can run their own dashboard across you and every other client they manage, with staff accounts and approval thresholds for bigger repairs — see the Property Managers section above for how that works. Either way, billing stays yours alone, and you can remove access anytime." },
              { q: 'I run a property management company. Is this for me?', a: "Yes. Sign up as a landlord, then create your own management organization from your dashboard in under a minute. From there you invite each landlord client by email, and once they accept you're running their properties, maintenance, and compliance from the same dashboard as everyone else you manage, a switcher between clients, staff accounts you control, and a dollar threshold per client so owners sign off automatically on bigger repairs. See the Property Managers page for the full picture." },
              { q: 'How does pricing work for a property management company?', a: "The same per-unit pricing as a regular landlord account, just totaled across every client portfolio you manage instead of one. No separate PM price list to learn, and no extra seat fee for staff accounts. See the calculator at /pricing." },
            ].map((item) => (
              <details key={item.q} className="group bg-white/3 border border-white/8 rounded-2xl px-5 py-4 open:border-[#12A5A9]/30 open:bg-white/5 transition-colors">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-white font-semibold [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="text-[#12A5A9] text-xl leading-none shrink-0 transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="text-white/60 text-sm leading-relaxed mt-3">{item.a}</p>
              </details>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <ScrollReveal>
        <h2 className="text-3xl font-bold mb-4 text-white">Ready to get started?</h2>
        <p className="text-white/50 mb-8">It takes about two minutes to set up your first property. That’s less time than the average group text about a leaky faucet.</p>
        <MagneticLink
          href="/signup"
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-4 rounded-full hover:opacity-90"
        >
          Create your free account
        </MagneticLink>
        </ScrollReveal>
      </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/8 py-8">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-white/60 text-sm mb-5 px-16 sm:px-0">iOS &amp; Android apps coming soon. The web app works great on your phone&apos;s browser today.</p>
          <div className="flex items-center justify-between text-sm text-white/60 flex-wrap gap-3">
            <span>© 2026 Prophandld LLC · Your Property. Handled.</span>
            <div className="flex gap-6 flex-wrap">
              <Link href="/contractors" className="hover:text-white transition">For contractors</Link>
              <Link href="/property-managers" className="hover:text-white transition">For property managers</Link>
              <Link href="/terms" className="hover:text-white transition">Terms</Link>
              <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
              <a href="mailto:admin@prophandld.com" className="hover:text-white transition">Contact</a>
              <Link href="/login" className="hover:text-white transition">Sign in</Link>
              <Link href="/signup" className="hover:text-white transition">Sign up</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Hidden while the hero is in view: a live mobile screenshot at
          844px height showed this floating bubble sitting directly on
          top of the hero's own "Sign in" button, partly covering it.
          The hero already has its own route to every action this widget
          offers (sign in, get started), so nothing is lost by waiting
          until a visitor has scrolled past it. */}
      {!heroVisible && <LandingHelpWidget />}

      {/* Mobile-only sticky CTA: the hero's own "Get started free" button
          is the only one on the page until the final CTA near the
          footer, and on a page this long that's most of the scroll.
          z-40, under the help widget's z-50 (bottom-24) so the two never
          visually compete even though they never actually overlap. */}
      {!heroVisible && (
        <div
          className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pt-3 bg-gradient-to-t from-[#0C1A2E] via-[#0C1A2E]/95 to-transparent motion-safe:animate-[floatUp_0.25s_ease-out]"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-white/70 text-sm font-semibold px-4 py-3 shrink-0">
              Sign in
            </Link>
            <MagneticLink
              href="/signup"
              className="flex-1 text-center bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-6 py-3 rounded-full hover:opacity-90"
            >
              Get started free
            </MagneticLink>
          </div>
        </div>
      )}
    </div>
  )
}
