'use client'

import { useState } from 'react'
import { SubscribeToAdd } from '@/components/BillingReminder'
import { useBillingStatus, BILLING_ENFORCED } from '@/lib/useBillingStatus'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { useLanguage, t } from '@/lib/i18n'

export default function NewUnitPage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
  const propertyId = params.id as string

  const billing = useBillingStatus()
  const billingBlocked = BILLING_ENFORCED && billing.needsPayment && billing.trialExpired
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    unit_number: '',
    floor: '',
    sqft: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError(t('notAuthenticatedShort', lang))
      setLoading(false)
      return
    }

    // Check for duplicate unit_number on this property
    const { data: existing } = await supabase
      .from('units')
      .select('id')
      .eq('property_id', propertyId)
      .eq('unit_number', form.unit_number.trim())
      .maybeSingle()

    if (existing) {
      setError(t('unitNumberExists', lang))
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase
      .from('units')
      .insert({
        property_id: propertyId,
        unit_number: form.unit_number.trim(),
        floor: form.floor ? parseInt(form.floor) : null,
        sqft: form.sqft ? parseInt(form.sqft) : null,
      })

    if (insertError) {
      setError(`${t('errorCreatingUnit', lang)} ${insertError.message}`)
      setLoading(false)
      return
    }

    fetch('/api/stripe/subscription/sync', { method: 'POST' }).catch(() => {})

    router.push(`/landlord/properties/${propertyId}`)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          {t('backToProperty', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-24" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">{t('addAUnitHeading', lang)}</h1>
        <p className="text-white/50 text-sm mb-8">{t('enterUnitDetails', lang)}</p>

        <ScrollReveal>
        {billingBlocked ? (
          <SubscribeToAdd what={t('unitsWord', lang)} />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="text-white/70 text-sm block mb-1">{t('unitNumberLabel', lang)}</label>
            <input
              type="text"
              name="unit_number"
              required
              value={form.unit_number}
              onChange={handleChange}
              placeholder="Unit 3"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('floorOptional', lang)}</label>
              <input
                type="number"
                name="floor"
                value={form.floor}
                onChange={handleChange}
                placeholder="2"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
            <div>
              <label className="text-white/70 text-sm block mb-1">{t('sqftOptional', lang)}</label>
              <input
                type="number"
                name="sqft"
                value={form.sqft}
                onChange={handleChange}
                placeholder="850"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <RippleButton
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? t('creatingUnitDots', lang) : t('addUnitBtnShort', lang)}
          </RippleButton>

        </form>
        )}
        </ScrollReveal>
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
