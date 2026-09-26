'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { CheckCircleIcon } from '@/components/icons'
import { CONTRACTOR_TABS } from '@/lib/navTabs'
import { StripeConnectCard } from '@/components/StripeConnectCard'
import { ContractorCredentials } from '@/components/ContractorCredentials'
import { Switch } from '@/components/Switch'
import { useCategoryOptions, saveCustomCategory } from '@/lib/categories'
import { useLanguage, t } from '@/lib/i18n'

export default function ContractorSettingsPage() {
  const router = useRouter()
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [otherCategoryText, setOtherCategoryText] = useState('')
  const [zip, setZip] = useState('')
  const [radiusMiles, setRadiusMiles] = useState(25)
  const [licensed, setLicensed] = useState(false)
  const [categoryOptions, addCategoryOption] = useCategoryOptions()

  const [userId, setUserId] = useState<string | null>(null)
  const [credentialsKey, setCredentialsKey] = useState(0)
  const [ratingSummary, setRatingSummary] = useState<{ avg_rating: number; review_count: number } | null>(null)
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)

      const { data: profileData } = await supabase
        .from('users')
        .select('service_categories, service_zip, service_radius_miles, licensed')
        .eq('id', user.id)
        .maybeSingle()

      if (profileData) {
        setSelectedCategories(profileData.service_categories || [])
        setZip(profileData.service_zip || '')
        setRadiusMiles(profileData.service_radius_miles || 25)
        setLicensed(profileData.licensed || false)
      }

      const { data: summary } = await supabase
        .rpc('get_contractor_rating_summary', { target_contractor_id: user.id })
        .maybeSingle()

      if (summary && (summary as any).review_count > 0) {
        setRatingSummary(summary as { avg_rating: number; review_count: number })
      }

      setLoading(false)
    }
    init()
  }, [router])

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    if (selectedCategories.length === 0) {
      setError(t('selectAtLeastOneCategory', lang))
      setSaving(false)
      return
    }
    if (selectedCategories.includes('Other') && !otherCategoryText.trim()) {
      setError(t('tellUsOtherService', lang))
      setSaving(false)
      return
    }
    if (!zip.trim()) {
      setError(t('enterZipYouService', lang))
      setSaving(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError(t('notAuthenticated', lang))
      setSaving(false)
      return
    }

    let finalCategories = selectedCategories
    if (selectedCategories.includes('Other')) {
      const customName = await saveCustomCategory(otherCategoryText, user.id)
      finalCategories = selectedCategories.map((c) => (c === 'Other' ? customName : c))
      addCategoryOption(customName)
      setSelectedCategories(finalCategories)
      setOtherCategoryText('')
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        service_categories: finalCategories,
        service_zip: zip.trim(),
        service_radius_miles: radiusMiles,
        licensed,
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error saving contractor profile:', updateError)
      setError(t('couldNotSaveProfile', lang))
      setSaving(false)
      return
    }

    setSuccess(t('profileSavedSuccess', lang))
    setCredentialsKey((k) => k + 1)
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/contractor" className="text-white/50 hover:text-white text-sm transition">
          {t('dashboard', lang)}
        </Link>
        <Link href="/contractor" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-24" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <div className="mb-8">
              <Skeleton className="h-7 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-56 mb-6" />
            <Skeleton className="h-16 mb-6" />
            <Skeleton className="h-64" />
          </div>
        ) : (
        <>
        <h1 className="text-2xl font-bold text-white mb-2">{t('serviceSettings', lang)}</h1>
        <p className="text-white/50 text-sm mb-8">
          {t('serviceSettingsDesc', lang)}
        </p>

        <ScrollReveal>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-white/70 text-sm block mb-2">{t('categoriesYouService', lang)}</label>
            <div className="flex flex-wrap gap-2">
              {[...categoryOptions, 'Other'].map((cat) => {
                const selected = selectedCategories.includes(cat)
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    aria-pressed={selected}
                    className={
                      selected
                        ? 'inline-flex items-center gap-1.5 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-medium rounded-full px-4 py-2 transition'
                        : 'inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-white/60 text-sm font-medium rounded-full px-4 py-2 hover:bg-white/8 hover:text-white transition'
                    }
                  >
                    {selected && <CheckCircleIcon className="w-3.5 h-3.5" />}
                    {cat}
                  </button>
                )
              })}
            </div>
            {selectedCategories.includes('Other') && (
              <input
                type="text"
                value={otherCategoryText}
                onChange={(e) => setOtherCategoryText(e.target.value)}
                placeholder={t('whatServiceOffer', lang)}
                className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('homeZip', lang)}</label>
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="19136"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('travelRadius', lang)}</label>
              <select
                value={radiusMiles}
                onChange={(e) => setRadiusMiles(parseInt(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#12A5A9] transition"
              >
                {[10, 25, 50, 100].map((mi) => (
                  <option key={mi} value={mi} className="bg-[#0C1A2E]">{mi} {t('milesUnit', lang)}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-white/50 text-xs -mt-2">
            {t('travelRadiusHelp', lang)}
          </p>

          <div className="flex items-center justify-between gap-3 bg-white/3 border border-white/8 rounded-xl p-4">
            <span className="text-white text-sm">{t('iAmLicensed', lang)}</span>
            <Switch checked={licensed} onChange={setLicensed} />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 text-[#12A5A9] text-sm">
              {success}
            </div>
          )}

          <RippleButton
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('saving', lang) : t('saveSettings', lang)}
          </RippleButton>
        </form>
        </ScrollReveal>

        {ratingSummary && (
          <ScrollReveal className="mt-10 pt-8 border-t border-white/8">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">{t('yourRating', lang)}</h2>
              <span className="text-xs bg-white/8 text-white/60 rounded-full px-2.5 py-1 font-semibold">
                ★ {ratingSummary.avg_rating.toFixed(1)} ({ratingSummary.review_count} {ratingSummary.review_count === 1 ? t('reviewWord', lang) : t('reviewsWord', lang)})
              </span>
            </div>
            <p className="text-white/50 text-sm mt-2">
              {t('ratingBasedOn', lang)}
            </p>
          </ScrollReveal>
        )}

        {userId && <ContractorCredentials key={credentialsKey} userId={userId} />}

        <div className="mt-10 pt-8 border-t border-white/8">
          <StripeConnectCard purpose="jobs" />
        </div>
        </>
        )}
      </main>

      <BottomTabBar tabs={CONTRACTOR_TABS} />
    </div>
  )
}
