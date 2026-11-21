'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getAccountRole } from '@/lib/accountRole'
import { MagneticLink } from '@/components/MagneticLink'
import { ScrollReveal } from '@/components/ScrollReveal'
import { DollarSignIcon, AlertTriangleIcon, FileTextIcon, CheckCircleIcon, MessageCircleIcon, LockIcon, StarIcon, GlobeIcon, ShieldIcon, MenuIcon, XIcon } from '@/components/icons'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { RepairStory } from '@/components/RepairStory'
import { ReceiptIcon } from '@/components/icons'
import { LandingHelpWidget } from '@/components/LandingHelpWidget'
import { ThemeIconButton } from '@/components/ThemeIconButton'

// The landing page was cut from ~15 sections to 6 (2026-11-20, outside
// feedback: "too long, I kept scrolling"). Nothing true was dropped, it was
// folded: the feature tour, notification preview, how-it-works tracker and
// role showcase all became the one interactive RepairStory; the old
// 10-card feature grid and the AI section became the eight tiles below.
const EVERYTHING_ELSE = [
  { icon: CheckCircleIcon, title: 'A Today list', desc: 'Home opens on what needs you, in order, each with one button: pay, review, confirm a time, renew a license.' },
  { icon: DollarSignIcon, title: 'Online rent', desc: 'Rent tracks itself every month. Tenants pay by bank transfer or card, or you mark cash and checks received in one tap.' },
  { icon: ReceiptIcon, title: 'Records & receipts', desc: 'Every dollar in and out, by property, with receipts and photos. A tax-time summary for your accountant.' },
  { icon: FileTextIcon, title: 'Leases & documents', desc: 'Write a Pennsylvania lease from your details, and keep leases, insurance and inspections in one vault.' },
  { icon: ShieldIcon, title: 'Compliance reminders', desc: 'Rental license, lead and smoke certificates, inspections: reminders go out before anything expires.' },
  { icon: MessageCircleIcon, title: 'Messages, not phone numbers', desc: 'One thread per repair, plus direct messages with any tenant or a contractor you have used before.' },
  { icon: StarIcon, title: 'Prophandld AI', desc: 'Reads bills, receipts and leases for you, answers questions from your own data, and drafts messages.', ai: true },
  { icon: GlobeIcon, title: 'English & Spanish', desc: 'The whole app, emails included, not a translated homepage that drops you back into English.' },
]

const WHO_ITS_FOR = [
  { who: 'Landlords', title: 'Every property, one dashboard', desc: 'Bring your own plumber or open a job to sealed bids. Rent, leases, records and compliance live in the same place.', cta: 'Sign up as a landlord', href: '/signup?role=landlord', primary: true },
  { who: 'Renters', title: 'Get things fixed, fast', desc: 'Report a problem in your own words, message your landlord, and pay rent the way your landlord accepts. Always free.', cta: 'Sign up as a renter', href: '/signup?role=renter' },
  { who: 'Contractors', title: 'Free leads. No cut.', desc: 'Real jobs near you for your trade. Bid privately, get picked on merit, and keep the whole price you bid.', cta: 'See how it works for contractors', href: '/contractors' },
]

const TRUST = [
  { icon: LockIcon, title: 'Payments run through Stripe', desc: 'Money goes straight to the person being paid. Prophandld never holds it.' },
  { icon: ShieldIcon, title: 'Sealed bidding, for real', desc: "No contractor ever sees another contractor's bid, not even that one exists." },
  { icon: AlertTriangleIcon, title: 'A real dispute window', desc: "48 hours after approval for either side to flag a problem, and the job pauses for review." },
  { icon: CheckCircleIcon, title: 'Payouts freeze if something looks off', desc: 'Change a payout bank account and payouts pause for 48 hours while we confirm it was you.' },
]

const FAQ = [
  { q: 'What does it cost?', a: "Nothing for 6 months during our pilot, AI included, no card needed. We'll set prices only after hearing from you, and nothing is ever charged unless you choose a plan. Renters never pay Prophandld. Contractors pay nothing, and if that ever changes they get 60 days' written notice first." },
  { q: 'Is this just for finding contractors?', a: 'No. It replaces your spreadsheet: homes, tenants, repairs, rent, bills, leases and records, all in one place.' },
  { q: 'How does sealed bidding work?', a: 'Contractors near the property are alerted when you open a job for bids. They submit their price privately and never see what anyone else bid. You choose who you trust, not just the lowest number.' },
  { q: 'Do I have to use a contractor?', a: 'No. Send a job straight to someone you already trust, or mark small things fixed yourself. Bidding is there when you want it.' },
  { q: 'How do rent and contractor payments work?', a: "Tenants pay rent the ways their landlord accepts: bank transfer (no fee, we cover it), debit card (instant, small card fee shown first), or Zelle, Venmo, check or cash. The landlord always gets the full rent. To pay a contractor, the landlord approves the finished work and pays by bank or card; the contractor gets the full amount. Prophandld never holds the money." },
  { q: 'What does Prophandld AI actually do?', a: "The busywork. It reads bills, receipts and leases and fills in the details, helps tenants describe a problem and spots emergencies, drafts messages, compares repair quotes, and writes a Pennsylvania lease from your details. Like any AI it can be wrong, so double-check anything important. It never gives repair steps for electrical, gas or structural problems." },
  { q: 'I run a property management company. Is this for me?', a: 'Yes. Pick "Property Manager" when you sign up and name your company. Invite each landlord client by email; once they accept, you run their homes from your dashboard, and each owner sets their own approval limit.' },
  { q: 'Can someone else help manage my properties?', a: 'Yes. Invite a business partner as a co-owner from your profile, or connect a property management company and set the dollar limit they can approve without you. You can remove access anytime.' },
  { q: 'Is Prophandld available in my area?', a: 'Onboarding landlords in the Philadelphia area now, with more markets opening after that.' },
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
// the rest of the page already claims: the free pilot offer and no
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
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free for 6 months during the pilot program' },
    },
  ],
}

export default function LandingPage() {
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const role = getAccountRole(session?.user)
      if (role === 'landlord') {
        // Same bug login/page.tsx's own login flow had: a PM visiting the
        // homepage directly (bookmark, PWA home-screen launch) landed on
        // the personal /landlord dashboard every time, with no PM check
        // at all here — this is actually the more likely way someone
        // hits this specific dead end, since it fires on every visit to
        // "/" while already signed in, not just the one-time login submit.
        let isPm = session!.user.user_metadata?.intent === 'property_manager'
        if (!isPm) {
          const { data: pmMembership } = await supabase
            .from('pm_organization_members')
            .select('id')
            .eq('user_id', session!.user.id)
            .eq('status', 'accepted')
            .maybeSingle()
          isPm = !!pmMembership
        }
        router.replace(isPm ? '/landlord/pm' : '/landlord')
      }
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
        <nav className="border-b border-white/8 px-4 sm:px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <BrandLink className="gap-2.5 shrink-0">
              <Logo className="w-[30px] h-[30px]" />
              <span className="font-bold text-lg tracking-tight max-[379px]:sr-only">Prophandld</span>
            </BrandLink>
            <span className="hidden xl:inline text-white/50 text-xs border-l border-white/15 pl-2.5 ml-0.5 whitespace-nowrap">Your Property. Handled.</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 lg:gap-5 min-w-0">
            <a href="#how-it-works" className="text-sm text-white/50 hover:text-white transition hidden lg:block whitespace-nowrap">How it works</a>
            <a href="#pricing" className="text-sm text-white/50 hover:text-white transition hidden lg:block whitespace-nowrap">Pricing</a>
            <a href="#roles" className="text-sm text-white/50 hover:text-white transition hidden lg:block whitespace-nowrap">Who it&apos;s for</a>
            <Link href="/contractors" className="text-sm text-white/50 hover:text-white transition hidden lg:block whitespace-nowrap">For contractors</Link>
            <Link href="/property-managers" className="text-sm text-white/50 hover:text-white transition hidden lg:block whitespace-nowrap">For property managers</Link>
            {/* Mobile: dropped from this row entirely (moved into the
                hamburger panel below) rather than just shrunk further --
                a live mobile screenshot at 390px showed it visually
                colliding with "Get started" and the brand wordmark once
                the hamburger button was added, with no more room left to
                squeeze. Still always visible on desktop. */}
            <ThemeIconButton className="hidden lg:inline-flex shrink-0" />
            <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition whitespace-nowrap shrink-0 hidden lg:block">
              Sign in
            </Link>
            <MagneticLink
              href="/signup"
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-3.5 sm:px-4 py-2 rounded-full hover:opacity-90 whitespace-nowrap shrink-0"
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
              className="lg:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white hover:border-white/30 transition"
            >
              {mobileMenuOpen ? <XIcon className="w-4 h-4" /> : <MenuIcon className="w-4 h-4" />}
            </button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/8 px-6 py-4 flex flex-col gap-1">
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">How it works</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">Pricing</a>
            <a href="#roles" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">Who it&apos;s for</a>
            <Link href="/contractors" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">For contractors</Link>
            <Link href="/property-managers" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium">For property managers</Link>
            <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white transition py-2.5 text-sm font-medium border-t border-white/8 mt-1 pt-3.5">Sign in</Link>
            <ThemeIconButton withLabel className="self-start mt-2" />
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
          Now welcoming Philadelphia landlords · Free for 6 months
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Run your rentals,<br />
          <RotatingHeroPhrase />
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
          One simple place to run your rentals. Keep track of your homes and tenants, get fair prices on repairs, and collect rent online. Easy enough for two units, strong enough for two hundred.
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
        <a href="#how-it-works" className="inline-flex items-center gap-1.5 mt-8 text-sm text-white/50 hover:text-white transition">
          Watch one repair, start to finish <span aria-hidden="true">↓</span>
        </a>
      </section>

      {/* 1. One repair, three views — the thesis of the whole product, so
          it sits directly under the hero instead of a feature list. */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 pb-20 scroll-mt-20">
        <ScrollReveal>
          <div className="text-center mb-10">
            <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-[0.16em] mb-3">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 text-balance">One repair. Three people. Nobody chasing anybody.</h2>
            <p className="text-white/50 max-w-2xl mx-auto">
              Follow one leaky sink from the tenant&apos;s report to the contractor&apos;s payment, and see exactly what each person sees at every step.
            </p>
          </div>
          <RepairStory />
        </ScrollReveal>
      </section>

      {/* 2. Everything else — one compact grid instead of the old feature
          tour + "beyond maintenance" + notifications + AI sections. */}
      <section className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]">
        <ScrollReveal className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-3 text-white text-balance">Repairs are just the start</h2>
          <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">
            Prophandld replaces the whole spreadsheet: rent, records, leases and deadlines, in the same place as your repairs.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {EVERYTHING_ELSE.map(({ icon: Icon, title, desc, ai }) => (
              <div
                key={title}
                className={`rounded-2xl p-5 border transition-colors ${ai ? 'bg-gradient-to-br from-[#0A7B7E]/20 to-white/3 border-[#12A5A9]/35' : 'bg-white/3 border-white/8 hover:border-[#12A5A9]/30'}`}
              >
                <Icon className="w-5 h-5 text-[#12A5A9] mb-3" />
                <h3 className="text-white font-semibold mb-1.5">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* 3. Philadelphia's Safe Healthy Homes law (Bill 250329-AA) — a real,
          dated deadline. Facts as corrected 2026-11-10 against the bill text:
          30 days applies to serious violations only, "or actual damages,
          whichever is more", the 15-day renewal grace period, one violation
          (not per day). "Safe Healthy Homes" is the public name, so it's
          always paired with the bill number. */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <ScrollReveal>
          <div className="relative overflow-hidden bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-white/3 border border-[#12A5A9]/25 rounded-3xl p-8 sm:p-12">
            <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-[0.16em] mb-4">Philadelphia landlords</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight max-w-3xl text-balance">
              Safe Healthy Homes (Bill 250329-AA) took effect November 1, 2026.
            </h2>
            <p className="text-white/60 leading-relaxed mb-8 max-w-2xl">
              A lapsed license or an unresolved serious violation can cost you the right to collect rent. Prophandld tracks
              your license and certificate dates and reminds you before they expire, not after an inspector does.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              {[
                { big: '30 days', small: 'to correct a serious cited violation' },
                { big: '15 days', small: 'grace period to renew a lapsed rental license' },
                { big: '$1,000+', small: "per violation a tenant can sue for (or actual damages if higher), plus attorney's fees" },
              ].map((x) => (
                <div key={x.big} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white font-bold text-xl tabular-nums">{x.big}</p>
                  <p className="text-white/50 text-xs mt-1 leading-relaxed">{x.small}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-5 flex-wrap">
              <Link href="/signup?role=landlord" className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 transition">
                Set up compliance tracking →
              </Link>
              <Link href="/philadelphia" className="text-[#12A5A9] text-sm font-semibold hover:underline">
                Check any Philadelphia address →
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* 4. Who it's for — landlords first (they're the customer), PMs given
          equal visual weight, renters and contractors looped in. */}
      <section id="roles" className="max-w-5xl mx-auto px-6 pb-20 scroll-mt-20">
        <ScrollReveal>
          <h2 className="text-3xl font-bold text-center mb-3 text-white text-balance">Built for landlords, with everyone else looped in</h2>
          <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">Easy enough for two units, strong enough for two hundred.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Property managers get a full-width card with their own demo,
                not one tile among four: a separate buyer with a separate pitch. */}
            <Link
              href="/property-managers#demo"
              className="group sm:col-span-2 rounded-2xl p-6 sm:p-8 border bg-gradient-to-br from-[#0A7B7E]/15 to-white/3 border-[#12A5A9]/35 transition-all hover:-translate-y-0.5 grid lg:grid-cols-[1.2fr_1fr] gap-6 items-center"
            >
              <div>
                <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-wider mb-3">Property management companies</p>
                <h3 className="text-white font-bold text-xl sm:text-2xl mb-2 text-balance">Every client, one login. Owners approve in one tap.</h3>
                <p className="text-white/55 text-sm leading-relaxed mb-4">
                  Each owner sets a repair limit. Anything bigger becomes an approval card with photos, the contractor&apos;s rating and the price. Monthly statements build themselves.
                </p>
                <span className="text-[#12A5A9] text-sm font-semibold group-hover:underline">Watch one approval, start to finish →</span>
              </div>
              <ul className="grid gap-2.5 text-sm">
                {[
                  'All clients and your own properties in one Today list',
                  'Owner approval limits, enforced automatically',
                  'Staff access per client, with an activity log',
                  'Rent stays with the owner unless they choose otherwise',
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2.5 text-white/75">
                    <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0 mt-0.5" />
                    {x}
                  </li>
                ))}
              </ul>
            </Link>
            <div className="sm:col-span-2 grid sm:grid-cols-3 gap-4">
            {WHO_ITS_FOR.map((r) => (
              <Link
                key={r.who}
                href={r.href}
                className={`group rounded-2xl p-6 border transition-all hover:-translate-y-0.5 ${r.primary ? 'bg-gradient-to-br from-[#0A7B7E]/15 to-white/3 border-[#12A5A9]/35' : 'bg-white/3 border-white/8 hover:border-[#12A5A9]/30'}`}
              >
                <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-wider mb-3">{r.who}</p>
                <h3 className="text-white font-bold text-lg mb-2">{r.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed mb-4">{r.desc}</p>
                <span className="text-[#12A5A9] text-sm font-semibold group-hover:underline">{r.cta} →</span>
              </Link>
            ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* 5. Pilot pricing + what protects your money. Pre-launch: no logo
          wall or testimonials (they'd have to be invented), only real,
          shipped mechanisms. Prices stay hidden during the pilot
          (src/lib/pilot.ts). */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 pb-20 scroll-mt-20">
        <ScrollReveal>
          <div className="relative overflow-hidden border border-[#12A5A9]/25 rounded-3xl bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-transparent">
            <div className="grid lg:grid-cols-[1.1fr_1fr]">
              <div className="p-8 sm:p-12">
                <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-[0.16em] mb-4">Pricing</p>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 text-balance">Free for 6 months during our pilot.</h2>
                <p className="text-white/60 leading-relaxed mb-2">
                  Everything is included, Prophandld AI too. No card needed. We&apos;ll set pricing only after we&apos;ve heard from the landlords, property managers and contractors using it.
                </p>
                <p className="text-white/45 text-sm leading-relaxed mb-7">Renters never pay Prophandld anything. Nothing is ever charged unless you choose a plan.</p>
                <MagneticLink href="/signup?role=landlord" className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 transition">
                  Join the free pilot →
                </MagneticLink>
              </div>
              <ul className="p-8 sm:p-12 lg:border-l border-t lg:border-t-0 border-white/8 space-y-5">
                {TRUST.map(({ icon: Icon, title, desc }) => (
                  <li key={title} className="flex gap-3.5">
                    <Icon className="w-4 h-4 text-[#12A5A9] shrink-0 mt-1" />
                    <div>
                      <p className="text-white font-semibold text-sm">{title}</p>
                      <p className="text-white/50 text-sm leading-relaxed mt-0.5">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* 6. Questions + the last call to action. */}
      <section className="border-t border-white/8 py-20">
        <ScrollReveal className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Common questions</h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="group bg-white/3 border border-white/8 rounded-2xl px-5 py-4 open:border-[#12A5A9]/30 open:bg-white/5 transition-colors">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-white font-semibold [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="text-[#12A5A9] text-xl leading-none shrink-0 transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="text-white/60 text-sm leading-relaxed mt-3">{item.a}</p>
              </details>
            ))}
          </div>

          <div className="text-center mt-20">
            <h2 className="text-3xl font-bold mb-4 text-white text-balance">Your first property takes about two minutes.</h2>
            <p className="text-white/50 mb-8">That&apos;s less time than the average group text about a leaky faucet.</p>
            <MagneticLink href="/signup" className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-4 rounded-full hover:opacity-90">
              Create your free account
            </MagneticLink>
          </div>
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
