'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MagneticLink } from '@/components/MagneticLink'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BuildingIcon, StarIcon, ShieldIcon } from '@/components/icons'
import { GoogleTranslateToggle } from '@/components/GoogleTranslateToggle'

type Org = {
  slug: string
  name: string
  pitch: string | null
  clientCount: number
  avgRating: number | null
  reviewCount: number
  licensed: boolean
  insured: boolean
  yearsInBusiness: number | null
  specialties: string[]
}

const SPECIALTY_LABELS: Record<string, string> = {
  single_family: 'Single-family',
  multifamily: 'Multifamily',
  short_term: 'Short-term/vacation',
  commercial: 'Commercial',
  hoa: 'HOA',
}

export default function PmDirectoryPage() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pm/directory')
      .then((r) => r.json())
      .then((data) => setOrgs(data.organizations || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="marketing-page min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <div className="flex items-center gap-6">
          <Link href="/property-managers" className="text-sm text-white/50 hover:text-white transition hidden sm:block">For property managers</Link>
          <GoogleTranslateToggle />
          <Link href="/login" className="text-sm font-medium text-white/70 hover:text-white transition">Sign in</Link>
          <MagneticLink
            href="/signup?role=landlord"
            className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-full hover:opacity-90"
          >
            Get started
          </MagneticLink>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto px-6 pt-16 pb-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Find a property manager</h1>
        <p className="text-white/50 max-w-xl mx-auto">
          Companies already running their client portfolios on Prophandld, open to taking on your property.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-white/40 text-center">No companies are listed yet. Check back soon.</p>
        ) : (
          <div className="space-y-3">
            {orgs.map((org) => (
              <Link
                key={org.slug}
                href={`/property-managers/${org.slug}`}
                className="block bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <BuildingIcon className="w-4 h-4 text-[#12A5A9] shrink-0" />
                      <h2 className="text-white font-semibold">{org.name}</h2>
                    </div>
                    {org.pitch && <p className="text-white/50 text-sm leading-relaxed">{org.pitch}</p>}
                  </div>
                  {org.avgRating !== null && (
                    <div className="flex items-center gap-1 text-sm text-white/70 shrink-0">
                      <StarIcon className="w-4 h-4 text-yellow-400" />
                      {org.avgRating.toFixed(1)}
                      <span className="text-white/30">({org.reviewCount})</span>
                    </div>
                  )}
                </div>
                {(org.licensed || org.insured || org.specialties.length > 0) && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-3">
                    {org.licensed && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-white/60 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                        <ShieldIcon className="w-3 h-3 text-[#12A5A9]" /> Licensed
                      </span>
                    )}
                    {org.insured && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-white/60 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                        <ShieldIcon className="w-3 h-3 text-[#12A5A9]" /> Insured
                      </span>
                    )}
                    {org.specialties.map((s) => (
                      <span key={s} className="text-[11px] font-medium text-[#12A5A9] bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-full px-2 py-0.5">
                        {SPECIALTY_LABELS[s] || s}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-white/30 text-xs mt-3">
                  Managing {org.clientCount} client{org.clientCount === 1 ? '' : 's'}
                  {org.yearsInBusiness !== null && ` · ${org.yearsInBusiness} year${org.yearsInBusiness === 1 ? '' : 's'} in business`}
                </p>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-white/30 text-sm mt-10">
          Run a property management company?{' '}
          <Link href="/property-managers" className="text-[#12A5A9] hover:underline">
            List yours here →
          </Link>
        </p>
      </section>
    </div>
  )
}
