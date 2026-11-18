import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BackHomeLink } from '@/components/BackHomeLink'
import { MagneticLink } from '@/components/MagneticLink'
import { CheckCircleIcon } from '@/components/icons'

export const metadata = {
  title: 'Pricing | Prophandld',
  description: 'Prophandld is free for 6 months during our pilot, Prophandld AI included. Pricing is coming soon, set with feedback from the landlords, property managers and contractors using it.',
  alternates: { canonical: '/pricing' },
}

const INCLUDED = [
  'Every property, unit, and tenant you manage',
  'Sealed bidding and the full maintenance job lifecycle',
  'Online rent collection, approval-gated job payments, and the rent roll',
  'Compliance tracking with automatic reminders',
  'Document vault, systems/CapEx tracking, and exportable reports',
  'Co-owner access for a business partner, or a property manager running it for you',
  'Unlimited contractors and renters linked to your properties',
  'Bank transfer rent collection with no fee for you or your tenant: Prophandld pays it',
  'Job payments to contractors: you cover the processing fee, so they always get their full agreed amount',
]

const AI_INCLUDED = [
  'A troubleshooting chat that walks tenants through safe fixes themselves, photo included',
  'Documents that fill in their own fields, lease or compliance, instead of you retyping them',
  'A heads-up before a license or inspection lapses, with real renewal guidance for it',
  'Lease Q&A for tenants, answered from their actual lease, not a guess',
  'Routine messages drafted for you: late-rent nudges, access notices, renewal offers',
  'A one-line morning briefing of what across your whole portfolio actually needs you',
  'A flag on a job that might be too thin for a contractor to bid on confidently',
  'Smart reply suggestions in any job chat or direct message',
]

export default function PricingPage() {
  return (
    <div className="marketing-page min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <BackHomeLink className="text-sm text-white/50 hover:text-white transition" />
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
        <div className="relative text-center mb-12 overflow-hidden">
          <div
            aria-hidden
            className="absolute left-1/2 -top-24 -translate-x-1/2 w-[560px] h-[560px] max-w-full rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(18,165,169,0.16) 0%, rgba(10,123,126,0.06) 42%, transparent 70%)' }}
          />
          <div className="relative">
            <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-[0.2em] mb-4">Pricing: coming soon</p>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight text-balance">
              Free for 6 months while we build it with you
            </h1>
            <p className="text-white/60 max-w-xl mx-auto leading-relaxed">
              During our pilot, everything is included, Prophandld AI too, with no card needed. We&apos;ll
              set pricing only after hearing from the landlords, property managers and contractors
              actually using it.
            </p>
            <p className="text-white/40 text-sm max-w-xl mx-auto leading-relaxed mt-3">
              Nothing is ever charged unless you choose a plan, and you&apos;ll hear from us well before
              billing starts. Renters never pay Prophandld anything.
            </p>
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 sm:p-8 mb-6">
          <h2 className="text-white font-semibold text-lg mb-4">Included in the pilot</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-white/60 text-sm leading-relaxed">
                <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#12A5A9]/25 bg-gradient-to-br from-[#0A7B7E]/10 to-white/[0.02] p-6 sm:p-8 mb-10">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h2 className="text-white font-semibold text-lg">Prophandld AI</h2>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/15 rounded-full px-2.5 py-1">Included free</span>
          </div>
          <p className="text-white/50 text-sm leading-relaxed mb-5">
            On for every landlord and property manager during the pilot, and every tenant on your
            properties gets it too.
          </p>
          <ul className="grid sm:grid-cols-2 gap-2.5">
            {AI_INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-white/60 text-xs leading-relaxed">
                <CheckCircleIcon className="w-3.5 h-3.5 text-[#12A5A9] shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center">
          <MagneticLink
            href="/signup?role=landlord"
            className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-3.5 rounded-full hover:opacity-90 transition"
          >
            Join the free pilot
          </MagneticLink>
          <p className="text-white/40 text-xs mt-4">
            Questions about pricing? <a href="mailto:admin@prophandld.com" className="text-[#12A5A9] hover:underline">admin@prophandld.com</a>
          </p>
        </div>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-center gap-6 text-sm text-white/60 flex-wrap">
          <span>© 2026 Prophandld LLC</span>
          <Link href="/terms/landlord" className="hover:text-white transition">Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
          <a href="mailto:admin@prophandld.com" className="hover:text-white transition">Contact</a>
        </div>
      </footer>
    </div>
  )
}
