'use client'

import { useEffect, useState } from 'react'
import { ScrollReveal } from '@/components/ScrollReveal'
import { useLanguage, t } from '@/lib/i18n'

type Person = { id: string; name: string; isYou: boolean }

// Read-only "who's on this lease" card for a renter's Profile — until now
// neither the primary tenant nor a co-renter had any way to see the full
// household list outside of inferring it from job chat participants.
// Adding/removing a co-renter stays a landlord-only action from the unit
// page; this just makes the existing household visible.
export function CoRentersSection() {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [unitLabel, setUnitLabel] = useState<string | null>(null)
  const [primary, setPrimary] = useState<Person | null>(null)
  const [coRenters, setCoRenters] = useState<Person[]>([])

  useEffect(() => {
    fetch('/api/co-renter/list')
      .then((res) => res.json())
      .then((data) => {
        if (data.tenancyId) {
          setUnitLabel(data.unitLabel)
          setPrimary(data.primary)
          setCoRenters(data.coRenters || [])
        }
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
        <div className="h-5 w-32 bg-white/5 rounded mb-4 animate-pulse" />
        <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
      </div>
    )
  }

  // No active tenancy at all — nothing to show, not even an empty card.
  if (!primary) return null

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-1">{t('yourHousehold', lang)}</h2>
      <p className="text-white/40 text-sm mb-4">
        {unitLabel ? t('yourHouseholdDesc', lang).replace('{unit}', unitLabel) : t('yourHouseholdDescGeneric', lang)}
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
          <span className="text-white/80 text-sm flex-1">{primary.name}</span>
          <span className="inline-flex items-center gap-1 text-[#12A5A9] text-[11px] font-semibold bg-[#12A5A9]/10 rounded-full px-2 py-0.5">
            {t('primaryTenantBadge', lang)}
          </span>
          {primary.isYou && <span className="text-white/40 text-xs">{t('thatsYou', lang)}</span>}
        </div>
        {coRenters.map((c) => (
          <div key={c.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
            <span className="text-white/80 text-sm flex-1">{c.name}</span>
            {c.isYou && <span className="text-white/40 text-xs">{t('thatsYou', lang)}</span>}
          </div>
        ))}
      </div>
      {coRenters.length === 0 && (
        <p className="text-white/40 text-xs mt-3">{t('noCoRentersYet', lang)}</p>
      )}
    </ScrollReveal>
  )
}
