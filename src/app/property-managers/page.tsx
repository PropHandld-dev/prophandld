'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getAccountRole } from '@/lib/accountRole'
import { MagneticLink } from '@/components/MagneticLink'
import { ScrollReveal } from '@/components/ScrollReveal'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BuildingIcon, ShieldIcon, DollarSignIcon, WrenchIcon, CheckCircleIcon, ClipboardListIcon } from '@/components/icons'

const WHY_POINTS = [
  {
    icon: BuildingIcon,
    title: 'Every client, one login',
    desc: 'A portfolio switcher across every landlord you manage, plus a combined view when you need the whole picture at once. No more ten separate spreadsheets for ten separate owners.',
  },
  {
    icon: ShieldIcon,
    title: 'Approval thresholds, built in',
    desc: "Set a dollar limit per client. You approve maintenance under it yourself; anything over it waits for your client's own sign-off in the app, automatically, with a logged audit trail of who approved what and when.",
  },
  {
    icon: WrenchIcon,
    title: 'A real contractor network, not a phone book',
    desc: "Your team posts a job to sealed bidding or brings in your own trusted contractor directly. Either way, quotes, scheduling, and payment all happen in the same place your clients can see into.",
  },
]

const COMPARISON_ROWS: { label: string; typical: string; prophandld: string }[] = [
  { label: 'Managing multiple owners', typical: 'Separate spreadsheets, email threads, or logins per client', prophandld: 'One login, a portfolio switcher across every client' },
  { label: 'Staff access control', typical: 'Everyone sees everything, or nobody does', prophandld: 'Per-teammate: who approves jobs, who sees financials' },
  { label: 'Owner sign-off on big repairs', typical: 'A phone call or a forwarded text, easy to lose track of', prophandld: 'Automatic above a threshold you set, logged every time' },
  { label: 'Maintenance vendors', typical: "Whoever you can get on the phone", prophandld: 'A real local contractor marketplace, sealed bidding included' },
]

const FAQS: { q: string; a: string }[] = [
  { q: 'Do I need a new kind of account?', a: "No. You sign up as a regular Prophandld landlord account, then create your property management organization from your dashboard in under a minute. That same login is where your own properties (if you have any) and every client's portfolio both live." },
  { q: 'Can my team have different access levels?', a: "Yes. Invite teammates by email and choose whether they can see financial details (rent totals, payment amounts) or just operate day-to-day, posting and approving maintenance jobs. You can change this any time." },
  { q: 'What happens with a repair that costs more than expected?', a: "You set a dollar threshold per client when you take them on. Anything at or under it, you handle yourself. Anything over it needs that specific owner's own approval in the app before a contractor gets paid, automatic, no awkward phone call needed, and it's all logged." },
  { q: 'Does Prophandld collect rent on my clients’ behalf?', a: "Not yet, and we're being upfront about that rather than overselling it: rent still runs through each owner's own account exactly as it does today, so nobody's funds pass through a third party that isn't licensed to hold them. We're working through what that would take to do properly and legally before ever touching it." },
  { q: 'What does it cost?', a: "Pricing follows the same per-unit structure as a regular landlord account, totaled across every client portfolio you manage. No separate PM price list to learn. See our pricing page for current rates." },
  { q: 'Can an owner still see their own data?', a: "Yes. The owner you invite keeps their own full account and sees their own properties, jobs, rent, and compliance exactly as before. You're managing alongside them, not replacing their access to their own information." },
]

export default function PropertyManagersLandingPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (getAccountRole(session?.user) === 'landlord') router.replace('/landlord/pm')
    })
  }, [router])

  return (
    <div className="marketing-page min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm text-white/50 hover:text-white transition hidden sm:block">For landlords</Link>
          <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition">Sign in</Link>
          <MagneticLink
            href="/signup?role=landlord&intent=property_manager"
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-90"
          >
            Get started
          </MagneticLink>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center overflow-hidden">
        <div aria-hidden className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#0A7B7E]/20 blur-3xl -z-10 motion-safe:animate-[drift_9s_ease-in-out_infinite]" />
        <div aria-hidden className="absolute -top-20 -right-24 w-80 h-80 rounded-full bg-[#12A5A9]/20 blur-3xl -z-10 motion-safe:animate-[drift_11s_ease-in-out_infinite_1s]" />

        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          For property management companies
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Ten clients.<br />
          <span className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] bg-clip-text text-transparent">One login.</span>
        </h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10">
          Manage every landlord client&apos;s properties, maintenance, and
          compliance from a single dashboard. A portfolio switcher for each
          client, staff access you control, and approval thresholds that keep
          owners in the loop automatically, without a phone call for every
          repair.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <MagneticLink
            href="/signup?role=landlord&intent=property_manager"
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-7 py-3.5 rounded-full hover:opacity-90"
          >
            Get started
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
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Built for managing clients, not just units</h2>
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
          <h2 className="text-3xl font-bold text-center mb-3 text-white">How this compares to running it by hand</h2>
          <p className="text-white/50 text-center max-w-2xl mx-auto mb-12">
            You already know the drill: spreadsheets per client, texts for approvals. Here&apos;s the honest side-by-side.
          </p>
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="hidden sm:grid grid-cols-3 text-xs font-semibold uppercase tracking-wide text-white/40 px-5 py-3 border-b border-white/8">
              <span></span>
              <span>The usual way</span>
              <span className="text-[#12A5A9]">Prophandld</span>
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`px-5 py-4 text-sm sm:grid sm:grid-cols-3 sm:gap-2 sm:items-start ${i !== COMPARISON_ROWS.length - 1 ? 'border-b border-white/8' : ''}`}
              >
                <span className="text-white font-medium block mb-2 sm:mb-0">{row.label}</span>
                <span className="text-white/40 block mb-1 sm:mb-0">
                  <span className="sm:hidden text-white/30 text-xs uppercase tracking-wide block mb-0.5">The usual way</span>
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

      {/* What you get */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Everything in one dashboard</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <ClipboardListIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Compliance tracking, per property</h3>
              <p className="text-white/50 text-sm leading-relaxed">Licenses, inspections, and lease details tracked across every client's buildings, not just the ones you remember to check.</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <DollarSignIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Clear financial reporting</h3>
              <p className="text-white/50 text-sm leading-relaxed">Per-client statements your team (or your client) can pull any time, no digging through months of messages to answer "what did we spend here?"</p>
            </div>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <ShieldIcon className="w-5 h-5 text-[#12A5A9] mb-3" />
              <h3 className="text-white font-semibold mb-1.5">Your client stays in control</h3>
              <p className="text-white/50 text-sm leading-relaxed">They keep their own full account and can see everything you do on their behalf, and remove your access at any time. Nothing hidden.</p>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* FAQ */}
      <section className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]">
        <ScrollReveal className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Questions property managers actually ask</h2>
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
        <h2 className="text-3xl font-bold text-white mb-4">Bring your whole portfolio under one roof.</h2>
        <p className="text-white/50 mb-8">Sign up, then create your organization from your dashboard in under a minute.</p>
        <MagneticLink
          href="/signup?role=landlord&intent=property_manager"
          className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-4 rounded-full hover:opacity-90"
        >
          Get started
        </MagneticLink>
      </section>

      <footer className="border-t border-white/8 px-6 py-8 text-center text-white/40 text-sm">
        <p className="text-white/60 text-sm mb-4">iOS &amp; Android apps coming soon. The web app works great on your phone&apos;s browser today.</p>
        <Link href="/" className="hover:text-white transition">Prophandld for landlords</Link>
        <span className="mx-2">·</span>
        <Link href="/terms/landlord" className="hover:text-white transition">Terms</Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
        <span className="mx-2">·</span>
        <a href="mailto:admin@prophandld.com" className="hover:text-white transition">Contact</a>
      </footer>
    </div>
  )
}
