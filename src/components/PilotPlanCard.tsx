'use client'

import { PILOT_FREE_MONTHS } from '@/lib/pilot'
import { useLanguage } from '@/lib/i18n'

// Shown in place of the billing and Prophandld AI cards during the pilot:
// what's included and that nothing is charged, without any prices.
export function PilotPlanCard() {
  const lang = useLanguage()
  const es = lang === 'es'
  const included = es
    ? ['Propiedades y unidades ilimitadas', 'Cobro y registro de renta', 'Mantenimiento con ofertas selladas', 'Prophandld AI incluido']
    : ['Unlimited properties and units', 'Rent collection and records', 'Maintenance with sealed bids', 'Prophandld AI included']
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#12A5A9]/30 bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-transparent p-6 mb-6">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-[#12A5A9]/15 text-[#12A5A9] text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1">
        {es ? 'Programa piloto' : 'Pilot program'}
      </p>
      <h2 className="text-white text-xl font-bold mt-3">
        {es ? `Gratis durante ${PILOT_FREE_MONTHS} meses` : `Free for ${PILOT_FREE_MONTHS} months`}
      </h2>
      <p className="text-white/60 text-sm mt-1.5 leading-relaxed max-w-prose">
        {es
          ? 'Todo está incluido mientras construimos Prophandld contigo. No necesitas tarjeta, y nunca se cobra nada sin que tú elijas un plan.'
          : "Everything is included while we build Prophandld with you. No card needed, and nothing is ever charged unless you choose a plan."}
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-4">
        {included.map((item) => (
          <li key={item} className="flex items-center gap-2 text-white/80 text-sm">
            <span aria-hidden className="w-5 h-5 rounded-full bg-[#12A5A9]/20 text-[#12A5A9] flex items-center justify-center text-xs">✓</span>
            {item}
          </li>
        ))}
      </ul>
      <p className="text-white/45 text-xs mt-4">
        {es
          ? 'Queremos tu opinión antes de definir precios. Te avisaremos con tiempo antes de que empiece cualquier cobro.'
          : "We want your feedback before we set prices. You'll hear from us well before any billing starts."}
      </p>
    </section>
  )
}
