'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { expectRow } from '@/lib/expectRow'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Skeleton } from '@/components/Skeleton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'
import { maxLateFee } from '@/lib/lateFee'
import { escalationSuggestion } from '@/lib/leaseEscalation'

// Was an inline toggle on the unit detail page itself — moved to its own
// screen (mirroring tenancy/new, the equivalent "create" flow) so editing
// a lease is a focused task instead of a ~150-line form appearing inside
// an already-dense page full of unrelated sections (rent, jobs, systems).
export default function EditTenancyPage() {
  const router = useRouter()
  const params = useParams()
  const lang = useLanguage()
  const propertyId = params.id as string
  const unitId = params.unitId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tenancy, setTenancy] = useState<any>(null)
  const [form, setForm] = useState({
    rent_amount: '',
    rent_due_day: '1',
    escalation_percent: '',
    escalation_frequency_months: '',
    occupants: '',
    pets: '',
    lease_notes: '',
    late_fee_amount: '',
    grace_period_days: '',
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: tenancyData } = await supabase
        .from('tenancies')
        .select('*')
        .eq('unit_id', unitId)
        .eq('ended', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!tenancyData) {
        router.replace(`/landlord/properties/${propertyId}/units/${unitId}`)
        return
      }

      setTenancy(tenancyData)
      setForm({
        rent_amount: tenancyData.rent_amount?.toString() || '',
        rent_due_day: tenancyData.rent_due_day?.toString() || '1',
        escalation_percent: tenancyData.escalation_percent?.toString() || '',
        escalation_frequency_months: tenancyData.escalation_frequency_months?.toString() || '',
        occupants: tenancyData.occupants?.toString() || '',
        pets: tenancyData.pets || '',
        lease_notes: tenancyData.lease_notes || '',
        late_fee_amount: tenancyData.late_fee_amount?.toString() || '',
        grace_period_days: tenancyData.grace_period_days?.toString() || '5',
      })
      setLoading(false)
    }
    load()
  }, [router, propertyId, unitId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSave = async () => {
    setError(null)

    const rentAmount = form.rent_amount ? parseFloat(form.rent_amount) : null
    const lateFeeAmount = form.late_fee_amount ? parseFloat(form.late_fee_amount) : null
    const lateFeeCap = maxLateFee(rentAmount)
    if (lateFeeAmount && lateFeeCap !== null && lateFeeAmount > lateFeeCap) {
      setError(`${t('lateFeeTooHighPrefix', lang)}$${lateFeeCap.toFixed(2)}${t('lateFeeTooHighSuffix', lang)}`)
      return
    }

    setSaving(true)

    const { error: updateError } = await expectRow(supabase
      .from('tenancies')
      .update({
        rent_amount: form.rent_amount ? parseFloat(form.rent_amount) : null,
        rent_due_day: form.rent_due_day ? parseInt(form.rent_due_day) : 1,
        escalation_percent: form.escalation_percent ? parseFloat(form.escalation_percent) : null,
        escalation_frequency_months: form.escalation_frequency_months ? parseInt(form.escalation_frequency_months) : null,
        occupants: form.occupants ? parseInt(form.occupants) : null,
        pets: form.pets.trim() || null,
        lease_notes: form.lease_notes.trim() || null,
        late_fee_amount: form.late_fee_amount ? parseFloat(form.late_fee_amount) : null,
        grace_period_days: form.grace_period_days ? parseInt(form.grace_period_days) : 5,
      })
      .eq('id', tenancy.id))

    if (updateError) {
      console.error('Error updating tenancy:', updateError)
      setError(t('couldNotSaveTenancyChanges', lang))
      setSaving(false)
      return
    }

    router.push(`/landlord/properties/${propertyId}/units/${unitId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C1A2E] px-6 py-10 max-w-xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  const suggestion = escalationSuggestion(tenancy)

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link
          href={`/landlord/properties/${propertyId}/units/${unitId}`}
          className="text-white/50 hover:text-white text-sm transition"
        >
          {t('backToUnitPlain', lang)}
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        <h1 className="text-2xl font-bold text-white mb-2">{t('editLeaseDetailsHeading', lang)}</h1>
        <p className="text-white/50 text-sm mb-8">{t('editLeaseDetailsDesc', lang)}</p>

        <ScrollReveal>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/70 text-sm block mb-1">{t('monthlyRentDollarLabel', lang)}</label>
                <input
                  type="number"
                  name="rent_amount"
                  value={form.rent_amount}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm block mb-1">{t('dueDayOfMonthLabel', lang)}</label>
                <input
                  type="number"
                  name="rent_due_day"
                  min={1}
                  max={28}
                  value={form.rent_due_day}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
            </div>

            {suggestion && (
              <div className="bg-[#12A5A9]/10 border border-[#12A5A9]/25 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-white/70 text-xs">
                  {t('escalationSuggestionPrefix', lang)} {suggestion.date.toLocaleDateString()} — {t('escalationSuggestionSuggested', lang)} <strong className="text-white">${suggestion.suggested.toFixed(2)}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, rent_amount: suggestion.suggested.toString() }))}
                  className="shrink-0 text-[#12A5A9] text-xs font-semibold hover:underline"
                >
                  {t('useThisAmountBtn', lang)}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/70 text-sm block mb-1">{t('escalationPercentLabelShort', lang)}</label>
                <input
                  type="number"
                  step="0.1"
                  name="escalation_percent"
                  value={form.escalation_percent}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
              <div>
                <label className="text-white/70 text-sm block mb-1">{t('everyMonthsLabel', lang)}</label>
                <input
                  type="number"
                  name="escalation_frequency_months"
                  value={form.escalation_frequency_months}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/70 text-sm block mb-1">{t('lateFeeOptionalLabel', lang)}</label>
                <input
                  type="number"
                  name="late_fee_amount"
                  value={form.late_fee_amount}
                  onChange={handleChange}
                  placeholder={t('noFeePlaceholder', lang)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                />
                {(() => {
                  const cap = maxLateFee(form.rent_amount ? parseFloat(form.rent_amount) : null)
                  return cap !== null ? (
                    <p className="text-white/40 text-xs mt-1">{t('lateFeeMaxHintPrefix', lang)}${cap.toFixed(2)}{t('lateFeeMaxHintSuffix', lang)}</p>
                  ) : null
                })()}
              </div>
              <div>
                <label className="text-white/70 text-sm block mb-1">{t('gracePeriodDaysLabel', lang)}</label>
                <input
                  type="number"
                  name="grace_period_days"
                  value={form.grace_period_days}
                  onChange={handleChange}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
                />
              </div>
            </div>
            <p className="text-white/50 text-xs -mt-2">{t('lateFeeHelperText', lang)}</p>

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('occupantsLabel', lang)}</label>
              <input
                type="number"
                name="occupants"
                value={form.occupants}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('petsLabel', lang)}</label>
              <input
                type="text"
                name="pets"
                value={form.pets}
                onChange={handleChange}
                placeholder={t('petsPlaceholder', lang)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            <div>
              <label className="text-white/70 text-sm block mb-1">{t('leaseNotesLabel', lang)}</label>
              <textarea
                name="lease_notes"
                value={form.lease_notes}
                onChange={handleChange}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#12A5A9] transition resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <RippleButton
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-2.5 rounded-xl transition hover:opacity-90 disabled:opacity-50 text-sm"
              >
                {saving ? t('savingDots', lang) : t('saveBtn', lang)}
              </RippleButton>
              <Link
                href={`/landlord/properties/${propertyId}/units/${unitId}`}
                className="text-white/60 text-sm hover:text-white transition"
              >
                {t('cancelBtn', lang)}
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </main>
    </div>
  )
}
