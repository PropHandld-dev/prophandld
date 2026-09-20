'use client'

import Link from 'next/link'
import { MagneticLink } from '@/components/MagneticLink'
import { ScrollReveal } from '@/components/ScrollReveal'
import { DollarSignIcon, AlertTriangleIcon, FileTextIcon, WrenchIcon, CalendarIcon, CheckCircleIcon, MessageCircleIcon, LockIcon } from '@/components/icons'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { RoleShowcase } from '@/components/RoleShowcase'
import { LandingHelpWidget } from '@/components/LandingHelpWidget'

const OPERATIONS_FEATURES = [
  { icon: DollarSignIcon, title: 'Online rent', desc: 'Rent tracks itself every month. Renters pay by debit card or bank transfer, no checks or cash to chase down.' },
  { icon: AlertTriangleIcon, title: 'Compliance alerts', desc: "Licenses, certificates, and detectors. Get warned before something expires, not after." },
  { icon: FileTextIcon, title: 'Documents vault', desc: 'Leases, deeds, insurance, inspection reports, all in one place per property, not scattered across email threads.' },
  { icon: WrenchIcon, title: 'Systems & appliances', desc: 'Track HVAC, water heaters, roofs, and panels with install dates and service history.' },
  { icon: CalendarIcon, title: 'Schedule calendar', desc: 'Every confirmed job, across every property, in one month view.' },
  { icon: CheckCircleIcon, title: 'Verified contractors', desc: "Contractors can submit license and insurance for review, so you can see who's verified before you pick a bid." },
  { icon: MessageCircleIcon, title: 'In-app messaging', desc: 'Message your tenants or a contractor you\'ve worked with before, job or no job, with no phone numbers exchanged.' },
  { icon: LockIcon, title: 'Dispute protection', desc: "If something's not right after a job wraps up, any side can flag it and Prophandld steps in to sort it out." },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white relative">

      {/* Nav */}
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
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

      {/* Hero */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center overflow-hidden">
        <div aria-hidden className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#0A7B7E]/20 blur-3xl -z-10 motion-safe:animate-[drift_9s_ease-in-out_infinite]" />
        <div aria-hidden className="absolute -top-20 -right-24 w-80 h-80 rounded-full bg-[#12A5A9]/20 blur-3xl -z-10 motion-safe:animate-[drift_11s_ease-in-out_infinite_1s]" />

        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          Now onboarding landlords in Philadelphia
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Run your rentals,<br />
          <span className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] bg-clip-text text-transparent">not a spreadsheet.</span>
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

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <ScrollReveal>
        <h2 className="text-3xl font-bold text-center mb-12 text-white">Everything you need. None of the group texts.</h2>
        <div className="grid sm:grid-cols-3 gap-6">
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
          <h2 className="text-3xl font-bold text-center mb-12 text-white">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-10">
            <div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-bold flex items-center justify-center mb-4">1</div>
              <h3 className="text-white font-semibold text-lg mb-2">Report the issue</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                A renter flags a problem, or a landlord starts a job directly.
                Photos and details included.
              </p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-bold flex items-center justify-center mb-4">2</div>
              <h3 className="text-white font-semibold text-lg mb-2">Compare sealed bids</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                Contractors submit private bids. The landlord picks the best
                one, with no bias and no bidding wars.
              </p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-bold flex items-center justify-center mb-4">3</div>
              <h3 className="text-white font-semibold text-lg mb-2">Job done, you confirm</h3>
              <p className="text-white/50 text-sm leading-relaxed">
                The contractor uploads before-and-after photos when the work&apos;s
                done. You review and sign off, or flag it for a closer look.
              </p>
            </div>
          </div>
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
            <h3 className="text-white font-bold text-lg mt-4 mb-2">Stop chasing quotes</h3>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              Manage every property, unit, and tenant in one dashboard, with no
              more spreadsheets or scattered notes. Get competitive bids,
              collect rent online, and pay contractors right here too.
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
              text threads.
            </p>
            <Link href="/signup?role=renter" className="text-[#12A5A9] text-sm font-semibold hover:underline">
              Sign up as a renter →
            </Link>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl p-7 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs font-semibold text-[#12A5A9] bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 px-2.5 py-1 rounded-full">Contractors</span>
            <h3 className="text-white font-bold text-lg mt-4 mb-2">Bid fair, get picked on merit</h3>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              See real jobs near you, submit a sealed bid, get picked on the
              merits, and get paid directly the moment the job&apos;s done.
            </p>
            <Link href="/signup?role=contractor" className="text-[#12A5A9] text-sm font-semibold hover:underline">
              Sign up as a contractor →
            </Link>
          </div>
        </div>
        </ScrollReveal>
      </section>

      {/* FAQ */}
      <section
        className="border-y border-white/8 py-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]"
      >
        <ScrollReveal className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12 text-white">Common questions</h2>
          <div className="space-y-4">
            {[
              { q: 'Is this just for finding contractors?', a: "No. Prophandld is built to replace the spreadsheet. Track every property, unit, and tenant, handle maintenance end-to-end with sealed bidding, and collect rent, all in one dashboard." },
              { q: 'How does sealed bidding actually work?', a: "Contractors submit their price privately, and never see what anyone else bid. This keeps quotes honest instead of inflated by guesswork." },
              { q: "What if the contractor's price changes?", a: 'If a contractor needs to adjust their price once work has started, they have to show you the new labor and parts breakdown, and you approve it before they move forward.' },
              { q: 'How do rent and contractor payments actually work?', a: "Rent is paid by debit card or bank transfer, not credit cards, so nobody's going into credit card debt to make rent. Contractor payouts are just as flexible. Money goes straight from payer to recipient through Stripe; Prophandld never holds it." },
              { q: 'Is Prophandld available in my area?', a: "We're currently onboarding beta landlords in the Philadelphia area, with more markets opening soon." },
            ].map((item) => (
              <div key={item.q} className="bg-white/3 border border-white/8 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-1.5">{item.q}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <ScrollReveal>
        <h2 className="text-3xl font-bold mb-4 text-white">Ready to get started?</h2>
        <p className="text-white/50 mb-8">It takes about two minutes to set up your first property.</p>
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
