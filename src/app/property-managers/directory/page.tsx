'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MagneticLink } from '@/components/MagneticLink'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BuildingIcon, StarIcon } from '@/components/icons'

type Org = {
  slug: string
  name: string
  pitch: string | null
  clientCount: number
  avgRating: number | null
  reviewCount: number
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
                <p className="text-white/30 text-xs mt-3">
                  Managing {org.clientCount} client{org.clientCount === 1 ? '' : 's'}
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
