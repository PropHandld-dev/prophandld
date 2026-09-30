'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { MagneticLink } from '@/components/MagneticLink'
import { ScrollReveal } from '@/components/ScrollReveal'
import { DollarSignIcon, AlertTriangleIcon, FileTextIcon, WrenchIcon, CalendarIcon, CheckCircleIcon, MessageCircleIcon, LockIcon, StarIcon, GlobeIcon } from '@/components/icons'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { RoleShowcase } from '@/components/RoleShowcase'
import { HowItWorksTracker, NotificationPreview } from '@/components/LandingTracker'
import { BellIcon, ReceiptIcon } from '@/components/icons'
import { LandingHelpWidget } from '@/components/LandingHelpWidget'

const OPERATIONS_FEATURES = [
  { icon: DollarSignIcon, title: 'Online rent', desc: 'Rent tracks itself every month. Renters pay by bank transfer or debit card. Edit any month, add a credit, or refund an overpayment in a tap.' },
  { icon: BellIcon, title: 'Instant alerts', desc: "The right person hears at the right moment: a new bid, a proposed time, work ready for review. By email, and on your phone's Home Screen." },
  { icon: ReceiptIcon, title: 'Receipts & records', desc: 'Every rent and repair payment gets a receipt, emailed to you and saved on the record.' },
  { icon: MessageCircleIcon, title: 'Job chat', desc: 'Every job has one thread for the landlord, renter and contractor, with updates and history in one place.' },
  { icon: MessageCircleIcon, title: 'Direct messages', desc: "Message your tenants, or a contractor you've worked with before, job or no job. No phone numbers exchanged." },
  { icon: CalendarIcon, title: 'Schedule calendar', desc: 'Confirmed visits, rent due dates, and expiring compliance items, all in one month view. It nags so you don\'t have to remember to.' },
  { icon: FileTextIcon, title: 'Documents vault', desc: 'Leases, deeds, insurance, inspection reports. Tenants can upload their own too, like proof of renters insurance, shared with you or kept private.' },
  { icon: WrenchIcon, title: 'Systems & appliances', desc: 'Track HVAC, water heaters, roofs, and panels with install dates and service history.' },
  { icon: CheckCircleIcon, title: 'Verified contractors', desc: "Contractors can submit license and insurance for review, so you can see who's verified before you pick a bid." },
  { icon: StarIcon, title: 'Real reviews', desc: 'Landlords and tenants rate every contractor after the job. See the actual feedback, not just a star count, before you pick who to trust.' },
  { icon: AlertTriangleIcon, title: 'Emergency priority', desc: 'Flag something that cannot wait and matching contractors are alerted with an emergency label.' },
  { icon: LockIcon, title: 'Dispute protection', desc: "Hopefully you never need it. After a landlord approves, any side has 48 hours to flag a problem and Prophandld steps in." },
  { icon: GlobeIcon, title: 'English & Spanish', desc: 'The entire app, not just a translated homepage. Switch anytime from your profile.' },
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

export default function LandingPage() {
  const router = useRouter()

  // A returning, already-signed-in visitor (especially one who installed
  // this as a Home Screen app) shouldn't have to look at a pitch for a
  // product they already use. getSession() reads the locally persisted
  // session with no network round trip, so this resolves fast enough not
  // to be a visible flash for the far more common case: someone who isn't
  // signed in at all, who this redirect never touches.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const role = session?.user?.user_metadata?.role
      if (role === 'landlord') router.replace('/landlord')
      else if (role === 'renter') router.replace('/renter')
      else if (role === 'contractor') router.replace('/contractor')
    })
  }, [router])

  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white relative">

      {/* Nav */}
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2.5">
          <BrandLink className="gap-2.5">
            <Logo className="w-[30px] h-[30px]" />
            <span className="font-bold text-lg tracking-tight">Prophandld</span>
          </BrandLink>
          <span className="hidden md:inline text-white/50 text-xs border-l border-white/15 pl-2.5 ml-0.5">Your Property. Handled.</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#how-it-works" className="text-sm text-white/50 hover:text-white transition hidden sm:block">How it works</a>
          <a href="#roles" className="text-sm text-white/50 hover:text-white transition hidden sm:block">Who it&apos;s for</a>
          <Link href="/contractors" className="text-sm text-white/50 hover:text-white transition hidden sm:block">For contractors</Link>
          <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition">
            Sign in
          </Link>
          <MagneticLink
            href="/signup"
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-90"
          >
            Get started
          </MagneticLink>
        </div>
      </nav>

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
          Contractor? Free local leads, no cut, ever. See how it works →
        </span>
      </Link>

      {/* Hero */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center overflow-hidden">
        <div aria-hidden className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#0A7B7E]/20 blur-3xl -z-10 motion-safe:animate-[drift_9s_ease-in-out_infinite]" />
        <div aria-hidden className="absolute -top-20 -right-24 w-80 h-80 rounded-full bg-[#12A5A9]/20 blur-3xl -z-10 motion-safe:animate-[drift_11s_ease-in-out_infinite_1s]" />

        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          Now onboarding landlords in Philadelphia
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Run your rentals,<br />
          <RotatingHeroPhrase />
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
          Prophandld is mini property management built for landlords who own
          a few places, not a few hundred. Track your properties and tenants,
          get competitive contractor bids through sealed bidding, and collect
          rent online, all in one place.
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

      {/* Safe Healthy Homes Act — a real, dated deadline for Philadelphia
          landlords, deliberately given its own prominent section rather than
          buried as one card among many. Facts below (30-day cure window,
          license suspension blocking rent collection, $1,000-per-violation
          private right of action) are sourced from actual legal coverage of
          the ordinance, not asserted from memory. */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="relative overflow-hidden bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-white/3 border border-[#12A5A9]/25 rounded-3xl p-8 sm:p-12">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
                Philadelphia landlords
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">
                Philadelphia&apos;s Safe Healthy Homes Act takes effect November 1, 2026.
              </h2>
              <p className="text-white/60 leading-relaxed mb-8 max-w-2xl">
                A lapsed rental license under the new law means you legally can&apos;t collect rent
                until it&apos;s fixed, and unresolved violations give tenants the right to sue for
                $1,000 or more per violation. Prophandld&apos;s compliance tracking warns you before a
                license or certificate expires, not after an inspector or a lawsuit tells you.
              </p>
              <div className="grid sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white font-bold text-lg">30 days</p>
                  <p className="text-white/50 text-xs mt-1">to fix a cited violation before your license can be suspended</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white font-bold text-lg">No license, no rent</p>
                  <p className="text-white/50 text-xs mt-1">a suspended license means you can&apos;t legally collect rent at all</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white font-bold text-lg">$1,000+</p>
                  <p className="text-white/50 text-xs mt-1">per violation a tenant can sue for, on top of attorney&apos;s fees</p>
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

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
        <h2 className="text-3xl font-bold text-center mb-12 text-white">Everything you need. None of the group texts.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-7 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#12A5A9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Sealed bidding</h3>
            <p className="text-white/50 text-sm leading-relaxed">
              Contractors bid without seeing each other&apos;s numbers. You get
              real competition, not inflated quotes.
            </p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-7 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#12A5A9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">No surprise costs</h3>
            <p className="text-white/50 text-sm leading-relaxed">
              If a contractor needs to adjust the price after starting, you
              see the labor and parts breakdown and approve it before they
              move forward.
            </p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-7 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#12A5A9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8a2 2 0 0 1 2-2h1l1.5-2h7L17 6h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Photo-verified work</h3>
            <p className="text-white/50 text-sm leading-relaxed">
              Every job wraps up with before-and-after photos, so you can see
              exactly what was done before you sign off.
            </p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-7 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#12A5A9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 3v6c0 4.86-3.14 8.53-7 9.93C8.14 17.53 5 13.86 5 9V6l7-3z" />
                <path d="M12 8v4.5" />
                <circle cx="12" cy="15.5" r="0.5" fill="#12A5A9" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Compliance, on autopilot</h3>
            <p className="text-white/50 text-sm leading-relaxed">
              Rental licenses, certificates, inspections. Add the expiry date
              once and get warned weeks out, not the day an inspector or a
              lawsuit tells you it already lapsed.
            </p>
          </div>
        </div>
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
            {OPERATIONS_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-4">
                  <Icon className="w-4 h-4 text-[#12A5A9]" />
                </div>
                <h3 className="text-white font-semibold mb-1.5">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
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
            <h3 className="text-white font-bold text-lg mt-4 mb-2">Free leads. No cut. Ever.</h3>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              Real jobs near you, sent straight to your phone for your trade.
              Submit a sealed bid and get picked on merit, not by who lowballed
              hardest. Get paid directly the moment the job&apos;s approved.{' '}
              <span className="text-white/70 font-medium">No signup fee, no monthly fee, no cut of your bid. Not now, not ever.</span>
            </p>
            <Link href="/contractors" className="text-[#12A5A9] text-sm font-semibold hover:underline">
              See how it works for contractors →
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>

      {/* Pricing teaser — final numbers aren't set yet (still being
          confirmed before official launch), so this deliberately shows the
          structure, not dollar figures: a real free tier, flat monthly
          plans through 25 units, then a per-unit rate that steps DOWN as a
          portfolio grows (26-100 / 101-500 / 500+ each get cheaper than
          the last) — a volume discount, not a per-unit penalty. Matches
          pricingTiers.ts exactly; keep this in sync if those tiers change. */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-8 sm:p-12 text-center">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              Pricing, finalizing before launch
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Free to try. Simple after that.</h2>
            <p className="text-white/50 max-w-xl mx-auto leading-relaxed mb-6">
              Your first unit is free, full stop. Flat monthly plans through
              25 units. Past that, a simple per-unit rate that gets cheaper
              the bigger you grow, never more expensive.
              We&apos;re confirming the exact numbers with a couple of advisors
              before official launch, so nothing&apos;s posted here yet, but
              the shape of it won&apos;t change: affordable for a landlord with
              a few properties, not priced like enterprise software.
            </p>
            <MagneticLink
              href="/signup?role=landlord"
              className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 transition"
            >
              Try it free →
            </MagneticLink>
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
              { q: 'What does it cost?', a: "Your first unit is free. Flat monthly plans through 25 units, then a per-unit rate that gets cheaper the bigger you grow. We're confirming the exact numbers before official launch. Contractors never pay anything, ever, no signup fee, no monthly fee, no cut of a bid." },
              { q: 'How does sealed bidding actually work?', a: "Contractors near the property are alerted when you open a job for bids. They submit their price privately and never see what anyone else bid. You choose who you trust, not just the lowest number. No bidding wars, no “my cousin quoted less”." },
              { q: 'Do I have to use a contractor?', a: "No. For anything small enough to handle yourself, mark it fixed directly, no bidding required. Contractors are there for when you want one, not a requirement for every repair." },
              { q: "What if the contractor's price changes?", a: 'If a contractor needs to adjust their price once work has started, they show you the new labor and parts breakdown, and you approve it before they move forward. No surprise invoices.' },
              { q: 'How do rent and contractor payments work?', a: "Renters pay rent by bank transfer or debit card, not credit cards, so nobody goes into card debt to make rent. Landlords pay contractors when they approve a finished job, by bank transfer or card. Payments are processed by Stripe and go straight to the person being paid." },
              { q: 'How will I know when something happens?', a: "You get an email for each step: a bid arrives, a time is proposed or confirmed, work is ready for review. Add Prophandld to your phone's Home Screen and you get instant alerts too." },
              { q: 'Do I get receipts and records?', a: 'Yes. Every rent payment and every contractor payment gets a receipt, emailed to you and saved on the job or rent record, so finding one later is a lookup, not a hunt.' },
              { q: 'What if a contractor cancels?', a: "The job reopens for sealed bids, nearby contractors are alerted again, and the landlord and renter are told. Photos, notes, and other bids stay put." },
              { q: "What if something isn't right after the job?", a: 'After the landlord approves, any side has 48 hours to raise a dispute. The job pauses while the Prophandld team reviews it. If nobody responds, finished work is approved automatically after 3 days so contractors are not left waiting.' },
              { q: 'Is Prophandld available in my area?', a: "We're currently onboarding beta landlords in the Philadelphia area, with more markets opening soon." },
              { q: "What is Philadelphia's Safe Healthy Homes Act?", a: "A new city law taking effect November 1, 2026. It requires cited violations to be fixed within 30 days, ties rent collection directly to having a valid rental license, and gives tenants the right to sue for $1,000 or more per unresolved violation. Prophandld's compliance tracking is built to keep your licenses and certificates from ever lapsing without you knowing." },
              { q: 'Does it work in Spanish?', a: 'The whole app does, not a translated homepage that quietly drops you back into English the moment you sign in. Switch anytime from your profile.' },
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

      {/* Footer */}
      <footer className="border-t border-white/8 py-8">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-sm text-white/60 flex-wrap gap-3">
          <span>© 2026 Prophandld · Your Property. Handled.</span>
          <div className="flex gap-6 flex-wrap">
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/login" className="hover:text-white transition">Sign in</Link>
            <Link href="/signup" className="hover:text-white transition">Sign up</Link>
          </div>
        </div>
      </footer>

      <LandingHelpWidget />
    </div>
  )
}
