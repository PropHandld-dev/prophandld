'use client'

import { useState } from 'react'
import { CountUp } from '@/components/CountUp'
import { graduatedMonthlyAmount, marketingTierName } from '@/lib/pricingTiers'

type TierDef = {
  name: string
  range: string
  min: number
  max: number | null
  detail: string
}

const TIERS: TierDef[] = [
  { name: 'Free', range: '1 unit', min: 1, max: 1, detail: 'Full access to everything. No credit card required.' },
  { name: 'Basic', range: '2–4 units', min: 2, max: 4, detail: 'Flat rate, not per-unit.' },
  { name: 'Pro', range: '5–10 units', min: 5, max: 10, detail: 'Flat rate, not per-unit.' },
  { name: 'Executive', range: '11–25 units', min: 11, max: 25, detail: 'Flat rate, not per-unit.' },
  { name: 'Portfolio', range: '26+ units', min: 26, max: null, detail: '$79.99 plus $1.75 for every unit past 25.' },
]

function priceCents(units: number): number {
  return Math.round(graduatedMonthlyAmount(units) * 100)
}

function formatCents(cents: number): string {
  const dollars = cents / 100
  if (dollars === 0) return 'Free'
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`
}

export function PricingCalculator() {
  const [units, setUnits] = useState(1)
  const activeTier = marketingTierName(units)
  const cents = priceCents(units)

  const setFromInput = (raw: string) => {
    const n = parseInt(raw, 10)
    setUnits(Number.isFinite(n) ? Math.min(9999, Math.max(1, n)) : 1)
  }

  return (
    <div>
      {/* Calculator */}
      <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6 sm:p-10 mb-4 overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-32 -right-24 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(18,165,169,0.22) 0%, rgba(10,123,126,0.08) 45%, transparent 70%)' }}
        />
        <div className="relative">
          <p className="text-[#12A5A9] text-xs font-semibold uppercase tracking-[0.2em] mb-6">Price calculator</p>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8">
            <div className="flex-1">
              <label htmlFor="pricing-unit-slider" className="text-white/70 text-sm block mb-3">
                How many units do you manage?
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="pricing-unit-slider"
                  type="range"
                  min={1}
                  max={60}
                  value={Math.min(units, 60)}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#12A5A9] bg-white/10"
                />
                <input
                  type="number"
                  aria-label="Number of units"
                  min={1}
                  max={9999}
                  value={units}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="w-20 shrink-0 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
              <p className="text-white/35 text-xs mt-2">Drag, or type an exact number. A single-family rental is 1 unit, a triplex is 3.</p>
            </div>

            <div className="text-center sm:text-right shrink-0">
              <span className="inline-block text-xs font-semibold uppercase tracking-wide text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-full px-3 py-1 mb-2">
                {activeTier} plan
              </span>
              <div className="text-5xl sm:text-6xl font-bold text-white tabular-nums leading-none">
                <CountUp value={cents} format={formatCents} />
                {cents > 0 && <span className="text-xl sm:text-2xl text-white/40 font-medium">/mo</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tier cards — the one matching the calculator above lights up */}
      <div className="grid sm:grid-cols-5 gap-3">
        {TIERS.map((tier) => {
          const active = activeTier === tier.name
          return (
            <div
              key={tier.name}
              className={`rounded-2xl border px-4 py-5 transition-all duration-300 ${
                active
                  ? 'border-[#12A5A9]/60 bg-[#12A5A9]/[0.08] shadow-[0_0_0_1px_rgba(18,165,169,0.3),0_20px_40px_-20px_rgba(18,165,169,0.4)]'
                  : 'border-white/8 bg-white/[0.02]'
              }`}
            >
              <p className={`font-semibold text-sm mb-1 ${active ? 'text-[#12A5A9]' : 'text-white'}`}>{tier.name}</p>
              <p className="text-white/40 text-xs mb-3">{tier.range}</p>
              <p className="text-white font-bold font-mono text-sm mb-2">
                {tier.min === 1 ? 'Free' : tier.max ? `$${graduatedMonthlyAmount(tier.min).toFixed(2)}` : `$79.99+`}
              </p>
              <p className="text-white/35 text-[11px] leading-relaxed">{tier.detail}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
