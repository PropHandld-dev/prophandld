import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BackHomeLink } from '@/components/BackHomeLink'
import { MagneticLink } from '@/components/MagneticLink'
import { CheckCircleIcon } from '@/components/icons'
import { PricingCalculator } from '@/components/PricingCalculator'

export const metadata = {
  title: 'Pricing | Prophandld',
  description: 'Simple, graduated pricing for landlords — free for your first unit, flat monthly plans through 25 units, then $1.75 per unit after that. Try the calculator.',
}

const INCLUDED = [
  'Every property, unit, and tenant you manage',
  'Sealed bidding and the full maintenance job lifecycle',
  'Online rent collection, escrow-style job payments, and the rent roll',
  'Compliance tracking with automatic reminders',
  'Document vault, systems/CapEx tracking, and exportable reports',
  'Co-owner access for a business partner or property manager',
  'Unlimited contractors and renters linked to your properties',
  'Bank transfer rent collection — the processing fee is shown to, and paid by, your tenant, never you',
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <BackHomeLink className="text-sm text-white/50 hover:text-white transition" />
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
        <div className="relative text-center mb-14">
          <div
            aria-hidden
            className="absolute left-1/2 -top-24 -translate-x-1/2 w-[560px] h-[560px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(18,165,169,0.16) 0%, rgba(10,123,126,0.06) 42%, transparent 70%)' }}
          />
          <div className="relative">
            <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-[0.2em] mb-4">Pricing</p>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">
              Pricing that grows the way your portfolio does
            </h1>
            <p className="text-white/60 max-w-xl mx-auto leading-relaxed">
              Your first unit is free, full stop. Flat monthly plans through 25 units, then $1.75
              per unit after that — one rate, no fine print. Renters and contractors never pay
              Prophandld anything, ever.
            </p>
          </div>
        </div>

        <div className="mb-10">
          <PricingCalculator />
        </div>

        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-5 mb-10 flex items-start gap-4">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-white/50 bg-white/8 rounded-full px-2.5 py-1 mt-0.5">
            Coming soon
          </span>
          <div>
            <p className="text-white text-sm font-semibold mb-1">AI pricing guidance — optional add-on</p>
            <p className="text-white/50 text-sm leading-relaxed">
              When a tenant reports an issue, Prophandld will suggest a fair price range for the
              job before you open it for bids, based on the category and your area — a second
              opinion, not a replacement for sealed bidding. Planned for a later phase, available
              on every plan when it ships.
            </p>
          </div>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 sm:p-8 mb-10">
          <h2 className="text-white font-semibold text-lg mb-4">Every plan includes</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-white/60 text-sm leading-relaxed">
                <CheckCircleIcon className="w-4 h-4 text-[#12A5A9] shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center mb-10">
          <p className="text-white/50 text-sm max-w-xl mx-auto leading-relaxed">
            &ldquo;Unit&rdquo; means a rentable unit on the platform — a single-family rental
            counts as one, a triplex counts as three. A 14-day free trial starts the first time
            you actually exceed 1 unit, not from the day you sign up.
          </p>
        </div>

        <div className="text-center">
          <MagneticLink
            href="/signup?role=landlord"
            className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-8 py-3.5 rounded-full hover:opacity-90 transition"
          >
            Get started free
          </MagneticLink>
        </div>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-center gap-6 text-sm text-white/60 flex-wrap">
          <span>© 2026 Prophandld LLC</span>
          <Link href="/terms/landlord" className="hover:text-white transition">Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
        </div>
      </footer>
    </div>
  )
}
