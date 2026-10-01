'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { MagneticLink } from '@/components/MagneticLink'
import { ScrollReveal } from '@/components/ScrollReveal'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { ShieldIcon, BellIcon, FileTextIcon, CalendarIcon, CheckCircleIcon, DollarSignIcon } from '@/components/icons'

// A dedicated, dated landing page rather than rewriting the homepage hero
// around this: the Nov 1, 2026 deadline is Philadelphia-specific and
// time-limited, and the homepage headline ("mini property management")
// is a portfolio-size claim meant to stay true in every market Prophandld
// is ever in. This page carries the urgency; the homepage stays evergreen.
// Facts below are the same ones already verified on the homepage's own
// Safe Healthy Homes Act section (30-day cure window, license suspension
// blocking rent collection, $1,000-per-violation private right of
// action) — not re-derived, just given this page's own home.
const COMPLIANCE_FEATURES = [
  {
    icon: ShieldIcon,
    title: 'Every license and certificate, tracked',
    desc: "Rental license, lead paint certification, fire/carbon monoxide inspections, whatever your property needs. One place that knows what you have and when it expires.",
  },
  {
    icon: BellIcon,
    title: 'Warned before it lapses, not after',
    desc: "An alert when something is approaching its expiry date, with enough runway to renew it before an inspector or a tenant's lawyer finds out first.",
  },
  {
    icon: FileTextIcon,
    title: 'Every certificate, one tap away',
    desc: "The actual PDF, not just a reminder that one exists. If a violation is cited, pull proof of compliance immediately instead of digging through email.",
  },
]

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Philadelphia's Safe Healthy Homes Act?",
    a: "A new city law taking effect November 1, 2026. It requires cited violations to be fixed within 30 days, ties rent collection directly to having a valid rental license, and gives tenants the right to sue for $1,000 or more per unresolved violation.",
  },
  {
    q: 'What happens if my license lapses and I miss it?',
    a: "Under the new law, a suspended license means you legally cannot collect rent until it's resolved — not a fine you can pay later and move on from, a hard stop on your income from that property. Prophandld's compliance tracking exists specifically to make sure you see it coming.",
  },
  {
    q: 'Does this replace checking with the city or an attorney?',
    a: "No. This page and Prophandld's compliance tracking tell you what you have on file and when it expires — they don't replace confirming your specific obligations with the City of Philadelphia or your own attorney.",
  },
  {
    q: 'Is Prophandld only for Philadelphia?',
    a: "We're starting here and growing from here. Everything on Prophandld (rent, jobs, documents, compliance tracking) works the same regardless of city — Philadelphia is just where we're onboarding first.",
  },
]

export default function PhiladelphiaLandingPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const role = session?.user?.user_metadata?.role
      if (role === 'landlord') router.replace('/landlord')
      else if (role === 'renter') router.replace('/renter')
      else if (role === 'contractor') router.replace('/contractor')
    })
  }, [router])

  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm text-white/50 hover:text-white transition hidden sm:block">What Prophandld does</Link>
          <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition">Sign in</Link>
          <MagneticLink
            href="/signup?role=landlord"
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-90"
          >
            Get started free
          </MagneticLink>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center overflow-hidden">
        <div aria-hidden className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#0A7B7E]/20 blur-3xl -z-10 motion-safe:animate-[drift_9s_ease-in-out_infinite]" />
        <div aria-hidden className="absolute -top-20 -right-24 w-80 h-80 rounded-full bg-[#12A5A9]/20 blur-3xl -z-10 motion-safe:animate-[drift_11s_ease-in-out_infinite_1s]" />

        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          Philadelphia landlords · Safe Healthy Homes Act
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Philadelphia rentals change<br />
          <span className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] bg-clip-text text-transparent">on November 1, 2026.</span>
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
          A lapsed rental license under the new law means you legally can&apos;t
          collect rent until it&apos;s fixed, and unresolved violations give
          tenants the right to sue for $1,000 or more per violation.
          Prophandld tracks every license and certificate for you, and warns
          you before one expires.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <MagneticLink
            href="/signup?role=landlord"
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-7 py-3.5 rounded-full hover:opacity-90"
          >
            Set up compliance tracking
          </MagneticLink>
          <Link
            href="/login"
            className="text-white font-semibold px-7 py-3.5 rounded-full border border-white/15 hover:border-white/30 transition"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* The law, in numbers */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <ScrollReveal>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <p className="text-white font-bold text-2xl mb-1">30 days</p>
              <p className="text-white/50 text-sm">to fix a cited violation before your license can be suspended</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <p className="text-white font-bold text-2xl mb-1">No license, no rent</p>
              <p className="text-white/50 text-sm">a suspended license means you can&apos;t legally collect rent at all</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <p className="text-white font-bold text-2xl mb-1">$1,000+</p>
              <p className="text-white/50 text-sm">per violation a tenant can sue for, on top of attorney&apos;s fees</p>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* How Prophandld keeps you ahead of it */}
      <section className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]">
        <ScrollReveal className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-3 text-white">Compliance that doesn&apos;t rely on you remembering</h2>
          <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">
            One dashboard for every property, instead of a mental list of what might be about to expire.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {COMPLIANCE_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/3 border border-white/8 rounded-2xl p-7 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-5">
                  <Icon className="w-5 h-5 text-[#12A5A9]" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* Beyond compliance */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <h2 className="text-3xl font-bold text-center mb-3 text-white">While you&apos;re here, it runs the rest too</h2>
          <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">
            Compliance tracking is one part of a full mini property-management app, not a standalone tool you&apos;d bolt onto something else.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <DollarSignIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Online rent</h3>
              <p className="text-white/50 text-sm leading-relaxed">Rent tracks itself every month. Renters pay by bank transfer or debit card.</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <CalendarIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Schedule calendar</h3>
              <p className="text-white/50 text-sm leading-relaxed">Confirmed repair visits, rent due dates, and expiring compliance items in one month view.</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <CheckCircleIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Verified contractors</h3>
              <p className="text-white/50 text-sm leading-relaxed">Sealed-bid repair jobs from contractors who&apos;ve submitted their own license and insurance for review.</p>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* FAQ */}
      <section className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]">
        <ScrollReveal className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Questions Philadelphia landlords ask</h2>
          <div className="space-y-3">
            {FAQS.map((item) => (
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
        <h2 className="text-3xl font-bold text-white mb-4">Don&apos;t find out from a violation notice.</h2>
        <p className="text-white/50 mb-8">Takes about two minutes to set up. Free for your first property.</p>
        <MagneticLink
          href="/signup?role=landlord"
          className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-4 rounded-full hover:opacity-90"
        >
          Get started free
        </MagneticLink>
      </section>

      <footer className="border-t border-white/8 px-6 py-8 text-center text-white/40 text-sm">
        <Link href="/" className="hover:text-white transition">Prophandld home</Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-white transition">Terms</Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
      </footer>
    </div>
  )
}
