import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BackHomeLink } from '@/components/BackHomeLink'
import { MagneticLink } from '@/components/MagneticLink'
import { CheckCircleIcon } from '@/components/icons'

export const metadata = {
  title: 'Pricing | Prophandld',
  description: 'Simple, graduated pricing for landlords — free for your first unit, flat monthly plans through 25 units, then a per-unit rate that gets cheaper as you grow.',
}

// Mirrors src/lib/pricingTiers.ts exactly — keep these numbers in sync if
// that file's tiers ever change. Duplicated as static display rows rather
// than importing the computation helpers, since this page has no live
// unit count to run them against (it's a public reference table, not a
// specific landlord's bill — see formatTierPrice() for that case).
const TIERS = [
  { name: 'Free', range: '1 unit', price: '$0', detail: 'Full access to everything. No credit card required.' },
  { name: 'Starter', range: '2–4 units', price: '$19.99/mo', detail: 'Flat rate, not per-unit.' },
  { name: 'Starter', range: '5–10 units', price: '$39.99/mo', detail: 'Flat rate, not per-unit.' },
  { name: 'Starter', range: '11–25 units', price: '$79.99/mo', detail: 'Flat rate, not per-unit.' },
  { name: 'Growth', range: '26–100 units', price: '$79.99 + $1.75/unit over 25', detail: 'e.g. 50 units = $123.74/mo' },
  { name: 'Portfolio', range: '101–500 units', price: '$211.24 + $1.25/unit over 100', detail: 'e.g. 200 units = $336.24/mo' },
  { name: 'Enterprise', range: '500+ units', price: '$711.24 + $1/unit over 500', detail: 'Contact us for a portfolio this size.' },
]

const INCLUDED = [
  'Every property, unit, and tenant you manage',
  'Sealed bidding and the full maintenance job lifecycle',
  'Online rent collection, late fees, and the rent roll',
  'Compliance tracking with automatic reminders',
  'Document vault, systems/CapEx tracking, and reports',
  'Co-owner access for a business partner or property manager',
  'Unlimited contractors and renters linked to your properties',
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

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Pricing that grows the way your portfolio does</h1>
          <p className="text-white/60 max-w-xl mx-auto leading-relaxed">
            Your first unit is free, full stop. Flat monthly plans through 25 units, then a
            per-unit rate that gets cheaper the bigger you grow — a volume discount, never a
            penalty. Renters and contractors never pay Prophandld anything, ever.
          </p>
        </div>

        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden mb-10">
          <div className="hidden sm:grid grid-cols-4 gap-4 px-6 py-3 border-b border-white/8 text-xs font-semibold uppercase tracking-wide text-white/40">
            <span>Plan</span>
            <span>Units</span>
            <span>Price</span>
            <span>Notes</span>
          </div>
          {TIERS.map((tier, i) => (
            <div
              key={`${tier.name}-${tier.range}`}
              className={`px-6 py-4 grid sm:grid-cols-4 gap-1 sm:gap-4 text-sm ${i !== TIERS.length - 1 ? 'border-b border-white/8' : ''} ${tier.range === '1 unit' ? 'bg-[#12A5A9]/5' : ''}`}
            >
              <span className="text-white font-semibold">{tier.name}</span>
              <span className="text-white/60">{tier.range}</span>
              <span className="text-white font-semibold font-mono">{tier.price}</span>
              <span className="text-white/40 text-xs sm:text-sm">{tier.detail}</span>
            </div>
          ))}
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
            "Unit" means a rentable unit on the platform — a single-family rental counts as one,
            a triplex counts as three. A 14-day free trial starts the first time you actually
            exceed 1 unit, not from the day you sign up.
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
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-center gap-6 text-sm text-white/60 flex-wrap">
          <span>© 2026 Prophandld LLC</span>
          <Link href="/terms/landlord" className="hover:text-white transition">Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
        </div>
      </footer>
    </div>
  )
}
