'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RippleButton } from '@/components/RippleButton'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CheckCircleIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

// Sits next to StripeConnectCard in the same "Get paid rent" section —
// same visual shell, different purpose: this never touches a payment
// processor at all. A renter sends money directly to one of these handles
// (see renter/rent/page.tsx), and the landlord's own existing "Mark
// received" flow stays the only thing that actually confirms it arrived.
// All three fields are optional and independent; a landlord who sets none
// changes nothing for their renters.
export function ZelleVenmoCashAppCard() {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [zelle, setZelle] = useState('')
  const [venmo, setVenmo] = useState('')
  const [cashapp, setCashapp] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('users')
        .select('zelle_handle, venmo_handle, cashapp_handle')
        .eq('id', user.id)
        .maybeSingle()
      setZelle(data?.zelle_handle || '')
      setVenmo(data?.venmo_handle || '')
      setCashapp(data?.cashapp_handle || '')
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase
      .from('users')
      .update({
        zelle_handle: zelle.trim() || null,
        venmo_handle: venmo.trim() || null,
        cashapp_handle: cashapp.trim() || null,
      })
      .eq('id', user.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-1">{t('p2pCardTitle', lang)}</h2>
      <p className="text-white/50 text-sm mb-4">{t('p2pCardBody', lang)}</p>

      {loading ? (
        <div className="space-y-2.5">
          <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-white/70 text-xs font-semibold block mb-1.5">{t('p2pZelleLabel', lang)}</label>
            <input
              type="text"
              value={zelle}
              onChange={(e) => setZelle(e.target.value)}
              placeholder={t('p2pZellePlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-xs font-semibold block mb-1.5">{t('p2pVenmoLabel', lang)}</label>
            <input
              type="text"
              value={venmo}
              onChange={(e) => setVenmo(e.target.value)}
              placeholder={t('p2pVenmoPlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div>
            <label className="text-white/70 text-xs font-semibold block mb-1.5">{t('p2pCashAppLabel', lang)}</label>
            <input
              type="text"
              value={cashapp}
              onChange={(e) => setCashapp(e.target.value)}
              placeholder={t('p2pCashAppPlaceholder', lang)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
            />
          </div>

          <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-3">
            <p className="text-yellow-400/90 text-xs leading-relaxed">{t('p2pRiskDisclosure', lang)}</p>
          </div>

          <div className="flex items-center gap-3">
            <RippleButton
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? t('savingDots', lang) : t('saveBtn', lang)}
            </RippleButton>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[#12A5A9] text-xs font-semibold">
                <CheckCircleIcon className="w-3.5 h-3.5" />
                {t('savedLabel', lang)}
              </span>
            )}
          </div>
        </div>
      )}
    </ScrollReveal>
  )
}
