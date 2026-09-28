'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { MagneticLink } from '@/components/MagneticLink'
import { ScrollReveal } from '@/components/ScrollReveal'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { DollarSignIcon, LockIcon, ReceiptIcon, CheckCircleIcon, StarIcon, BellIcon } from '@/components/icons'

const WHY_POINTS = [
  {
    icon: DollarSignIcon,
    title: 'No cut, ever',
    desc: 'Not a signup fee, not a monthly membership, not a percentage off your bid. What you bid is what lands in your account.',
  },
  {
    icon: LockIcon,
    title: 'Sealed bidding',
    desc: "Nobody sees anyone else's number, yours included. You get picked on trust and quality, not because you raced someone to the bottom.",
  },
  {
    icon: ReceiptIcon,
    title: 'Paid directly, fast',
    desc: "The moment a landlord approves your finished work, payment goes straight to your account through Stripe. No chasing checks, no 'the check is in the mail.'",
  },
]

const COMPARISON_ROWS: { label: string; typical: string; prophandld: string }[] = [
  { label: 'Fee to see local jobs', typical: 'Monthly membership, common', prophandld: 'Never, not even $1' },
  { label: 'Cut of what you bid', typical: 'Often 10–20% off the top', prophandld: '$0, always' },
  { label: 'How you get picked', typical: 'Usually whoever bids lowest', prophandld: 'Sealed bid, picked on merit and trust' },
  { label: 'Getting paid', typical: 'Varies, sometimes delayed', prophandld: 'Direct deposit the moment work is approved' },
]

const FAQS: { q: string; a: string }[] = [
  { q: 'Is it actually free? What is the catch?', a: "There is no catch. Landlords pay a small monthly subscription to run their properties on Prophandld, similar to any small-business software. That is where the business makes money, not from contractors. You keep everything you bid." },
  { q: 'How do I get matched with jobs?', a: "Set your trade categories, your home ZIP code, and how far you are willing to travel. You are alerted the moment a matching job opens for bidding near you, by email and on your phone if you add Prophandld to your Home Screen." },
  { q: 'What if I already work with a landlord who is not on here?', a: 'They can invite you directly with your email, no bidding required. Everything from the first message to the final payment happens in one place instead of scattered texts and paper receipts.' },
  { q: 'How does sealed bidding actually help me?', a: "You submit your real price without seeing what anyone else bid, and nobody sees yours. That means no race to undercut the next guy just because you are worried they will. Landlords pick based on your reviews and your price, not only the lowest number in the room." },
  { q: 'Where is Prophandld available?', a: "We're currently onboarding contractors in the Philadelphia area, with more markets opening soon." },
]

export default function ContractorsLandingPage() {
  const router = useRouter()

  // A contractor who's already signed in doesn't need the pitch — send them
  // straight to their dashboard. Landlords and renters (or anyone signed
  // out) still see this page normally; a landlord reading this to decide
  // whether to forward it to their own contractor is a real, good use case.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.user_metadata?.role === 'contractor') router.replace('/contractor')
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
          <Link href="/" className="text-sm text-white/50 hover:text-white transition hidden sm:block">For landlords</Link>
          <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition">Sign in</Link>
          <MagneticLink
            href="/signup?role=contractor"
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
          Now onboarding contractors in Philadelphia
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Free local leads.<br />
          <span className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] bg-clip-text text-transparent">No cut. Ever.</span>
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
          Real repair jobs from real landlords near you, sent straight to your
          phone for your trade. Submit a sealed bid, get picked on merit, and
          get paid directly the moment the work is approved. Prophandld never
          takes a cut of what you bid, not now, not ever.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <MagneticLink
            href="/signup?role=contractor"
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

      {/* Why */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Why contractors stick around</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {WHY_POINTS.map(({ icon: Icon, title, desc }) => (
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

      {/* Comparison */}
      <section className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]">
        <ScrollReveal className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-3 text-white">How this compares to the usual lead apps</h2>
          <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">
            You already know the drill from other apps. Here is the honest side-by-side.
          </p>
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 text-xs font-semibold uppercase tracking-wide text-white/40 px-5 py-3 border-b border-white/8">
              <span></span>
              <span>Typical lead app</span>
              <span className="text-[#12A5A9]">Prophandld</span>
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`grid grid-cols-3 gap-2 px-5 py-4 text-sm ${i !== COMPARISON_ROWS.length - 1 ? 'border-b border-white/8' : ''}`}
              >
                <span className="text-white font-medium">{row.label}</span>
                <span className="text-white/40">{row.typical}</span>
                <span className="text-white/90 flex items-start gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0 mt-0.5" />
                  {row.prophandld}
                </span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* What you get */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Beyond the bid</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <BellIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Matched, not flooded</h3>
              <p className="text-white/50 text-sm leading-relaxed">Set your trades, your ZIP, and your travel radius. You only hear about jobs you would actually want.</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <StarIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Reviews that build your name</h3>
              <p className="text-white/50 text-sm leading-relaxed">Every completed job earns a real review landlords can see, not just a star count. Good work compounds.</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <CheckCircleIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Get verified, stand out</h3>
              <p className="text-white/50 text-sm leading-relaxed">Submit your license and insurance once. Verified contractors show a badge landlords trust at a glance.</p>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* FAQ */}
      <section className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]">
        <ScrollReveal className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Questions contractors actually ask</h2>
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
        <h2 className="text-3xl font-bold text-white mb-4">Your next job is a ZIP code away.</h2>
        <p className="text-white/50 mb-8">Takes about two minutes. No fee to join, no fee ever.</p>
        <MagneticLink
          href="/signup?role=contractor"
          className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-4 rounded-full hover:opacity-90"
        >
          Get started free
        </MagneticLink>
      </section>

      <footer className="border-t border-white/8 px-6 py-8 text-center text-white/40 text-sm">
        <Link href="/" className="hover:text-white transition">Prophandld for landlords</Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-white transition">Terms</Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
      </footer>
    </div>
  )
}
