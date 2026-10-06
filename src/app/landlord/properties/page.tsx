'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { BuildingIcon } from '@/components/icons'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { MagneticLink } from '@/components/MagneticLink'
import { CountUp } from '@/components/CountUp'
import { PropertiesMap } from '@/components/PropertiesMap'
import { fetchAllPagesOrEmpty } from '@/lib/pagedQuery'
import { useLanguage, t } from '@/lib/i18n'

export default function PropertiesPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  // Remembered per-device only — a light convenience, not something that
  // needs to sync across a landlord's phone and laptop.
  const [view, setView] = useState<'list' | 'map'>('list')
  useEffect(() => {
    try {
      const saved = localStorage.getItem('propertiesView')
      if (saved === 'map' || saved === 'list') setView(saved)
    } catch {}
  }, [])
  const setViewPersisted = (v: 'list' | 'map') => {
    setView(v)
    try {
      localStorage.setItem('propertiesView', v)
    } catch {}
  }

  // Always fetches the whole portfolio (archived included) — the active/
  // archived counts need every row regardless of which view is showing,
  // same reasoning as the search-filter comment below. Previously this
  // only fetched active rows unless showArchived was already on, which
  // meant the "Archived" stat always read 0 until a landlord happened to
  // open that view first — a real bug found by live testing, not a style
  // preference.
  const fetchProperties = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }

    // Paged: Supabase silently caps a single response at 1000 rows and
    // drops the rest — the top pricing tier now goes to 500+ units, and a
    // portfolio that large plausibly has enough properties to approach
    // that on its own, let alone alongside everything else on this page.
    const data = await fetchAllPagesOrEmpty<any>((from, to) =>
      supabase
        .from('properties')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to)
    )
    setProperties(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchProperties()
  }, [])

  const handleArchiveToggle = async (propertyId: string, currentlyArchived: boolean) => {
    const { error } = await supabase
      .from('properties')
      .update({ archived: !currentlyArchived })
      .eq('id', propertyId)

    if (error) {
      console.error('Error updating archive status:', error)
      return
    }

    await fetchProperties()
  }

  const activeCount = properties.filter((p) => !p.archived).length
  const archivedCount = properties.filter((p) => p.archived).length

  // Counts above stay portfolio-wide on purpose — search narrows what's
  // shown, not what's counted, same as the rent roll's stats follow its
  // own filter but these totals describe the whole portfolio regardless.
  const filteredProperties = useMemo(() => {
    const byArchived = properties.filter((p) => (showArchived ? true : !p.archived))
    const q = search.trim().toLowerCase()
    if (!q) return byArchived
    return byArchived.filter((p) =>
      [p.address, p.city, p.state, p.zip, p.property_type].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    )
  }, [properties, search, showArchived])

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <MagneticLink
          href="/landlord/properties/new"
          className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition"
        >
          {t('addPropertyBtn', lang)}
        </MagneticLink>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10 pb-28">

        {loading ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
            <div className="grid gap-4">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
              <h1 className="text-2xl font-bold text-white">{t('yourPropertiesTitle', lang)}</h1>
              <div className="flex items-center gap-4">
                {properties.length > 0 && (
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-0.5">
                    <button
                      onClick={() => setViewPersisted('list')}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                        view === 'list' ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {t('listView', lang)}
                    </button>
                    <button
                      onClick={() => setViewPersisted('map')}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                        view === 'map' ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {t('mapView', lang)}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="text-white/60 hover:text-white text-sm transition"
                >
                  {showArchived ? t('hideArchived', lang) : t('showArchived', lang)}
                </button>
              </div>
            </div>

            {properties.length > 0 && (
              <div className="mb-6">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchPropertiesPlaceholder', lang)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
            )}

            {properties.length > 0 && (
              <ScrollReveal>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <BuildingIcon className="w-5 h-5 text-[#12A5A9]" />
                  </div>
                  <CountUp value={activeCount} className="text-2xl font-bold text-white" />
                  <div className="text-white/60 text-sm mt-1">{t('activeProperties', lang)}</div>
                </div>
                <div className="bg-white/3 border border-white/8 rounded-2xl p-5 hover:border-[#12A5A9]/30 hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <BuildingIcon className="w-5 h-5 text-white/60" />
                  </div>
                  <CountUp value={archivedCount} className="text-2xl font-bold text-white" />
                  <div className="text-white/60 text-sm mt-1">{t('archived', lang)}</div>
                </div>
              </div>
              </ScrollReveal>
            )}

            {properties.length > 0 && view === 'map' ? (
              <ScrollReveal>
                <PropertiesMap
                  properties={filteredProperties.map((p) => ({
                    id: p.id,
                    address: p.address,
                    city: p.city,
                    state: p.state,
                    lat: p.lat ?? null,
                    lng: p.lng ?? null,
                    propertyType: p.property_type ?? null,
                  }))}
                />
              </ScrollReveal>
            ) : properties.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-12 text-center">
                <BuildingIcon className="w-10 h-10 text-white/50 mx-auto mb-4" />
                <h3 className="text-white font-semibold mb-2">
                  {showArchived ? t('noArchivedProperties', lang) : t('noPropertiesYet', lang)}
                </h3>
                {!showArchived && (
                  <>
                    <p className="text-white/60 text-sm mb-6">{t('addFirstPropertyShort', lang)}</p>
                    <MagneticLink
                      href="/landlord/properties/new"
                      className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition inline-block"
                    >
                      {t('addProperty', lang)}
                    </MagneticLink>
                  </>
                )}
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-12 text-center">
                <p className="text-white/50 text-sm">{t('noPropertiesMatchSearch', lang)}</p>
              </div>
            ) : (
              <ScrollReveal>
              <div className="grid gap-4">
                {filteredProperties.map((property) => (
                  <div
                    key={property.id}
                    className="bg-white/3 border border-white/8 rounded-2xl p-6 hover:border-[#12A5A9]/30 hover:bg-white/5 hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <Link href={`/landlord/properties/${property.id}`} className="flex-1">
                        <h3 className="text-white font-semibold text-lg">{property.address}</h3>
                        <p className="text-white/50 text-sm mt-1">{property.city}, {property.state} {property.zip}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <span className="text-xs bg-white/8 text-white/60 rounded-full px-3 py-1 capitalize">{property.property_type}</span>
                          {property.archived && (
                            <span className="text-xs bg-yellow-500/10 text-yellow-400/70 border border-yellow-500/20 rounded-full px-3 py-1">
                              {t('archivedBadge', lang)}
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className="flex items-center gap-4">
                        {property.archived && (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              handleArchiveToggle(property.id, property.archived)
                            }}
                            className="text-white/60 hover:text-white text-xs transition"
                          >
                            {t('unarchive', lang)}
                          </button>
                        )}
                        <Link href={`/landlord/properties/${property.id}`} className="text-white/50 text-xl">→</Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </ScrollReveal>
            )}
          </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}