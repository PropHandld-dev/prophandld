'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ScrollReveal } from '@/components/ScrollReveal'
import { CheckCircleIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

// Lets a renter set/change their usual rent payment method from Profile,
// not just have it picked up implicitly from whatever they last chose on
// the Pay screen (renter/rent/page.tsx saves it there too — same column,
// either place updates it). Unlike the Zelle/Venmo/Cash App handles
// themselves, this field is just a remembered preference with no money
// destination attached, so a direct client-side update (own row, already
// RLS-permitted) is enough — no reauth needed, same reasoning
// ZelleVenmoCashAppCard uses to decide when reauth IS needed.
const METHODS = ['bank', 'card', 'zelle', 'venmo', 'cashapp'] as const
type Method = (typeof METHODS)[number]

export function RentPaymentDefaultCard() {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState<{ zelle: boolean; venmo: boolean; cashapp: boolean }>({ zelle: false, venmo: false, cashapp: false })
  const [selected, setSelected] = useState<Method | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/rent/p2p-options')
      .then((res) => res.json())
      .then((data) => {
        setAvailable({ zelle: !!data.zelle, venmo: !!data.venmo, cashapp: !!data.cashapp })
        if (METHODS.includes(data.defaultMethod)) setSelected(data.defaultMethod)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const choose = async (method: Method) => {
    setSelected(method)
    setSaved(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('users').update({ default_rent_payment_method: method }).eq('id', user.id)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const labelFor = (m: Method) =>
    m === 'bank' ? t('bankAccountOptionLabel', lang)
    : m === 'card' ? t('debitCardOptionLabel', lang)
    : m === 'zelle' ? 'Zelle'
    : m === 'venmo' ? 'Venmo'
    : 'Cash App'

  const visibleMethods = METHODS.filter((m) => m === 'bank' || m === 'card' || available[m as 'zelle' | 'venmo' | 'cashapp'])

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6">
      <h2 className="text-white font-semibold mb-1">{t('rentPaymentDefaultTitle', lang)}</h2>
      <p className="text-white/50 text-sm mb-4">{t('rentPaymentDefaultDesc', lang)}</p>

      {loading ? (
        <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {visibleMethods.map((m) => (
            <button
              key={m}
              onClick={() => choose(m)}
              className={`text-sm font-medium px-4 py-2 rounded-xl border transition ${
                selected === m
                  ? 'bg-[#12A5A9]/15 border-[#12A5A9]/50 text-white'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/8'
              }`}
            >
              {labelFor(m)}
            </button>
          ))}
          {saved && (
            <span className="inline-flex items-center gap-1 text-[#12A5A9] text-xs font-semibold ml-1">
              <CheckCircleIcon className="w-3.5 h-3.5" />
              {t('savedLabel', lang)}
            </span>
          )}
        </div>
      )}
      <p className="text-white/40 text-xs mt-4">{t('rentPaymentDefaultNote', lang)}</p>
    </ScrollReveal>
  )
}
