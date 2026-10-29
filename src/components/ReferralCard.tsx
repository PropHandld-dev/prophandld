'use client'

import { useEffect, useState } from 'react'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'

type ReferralItem = { id: string; createdAt: string; referredName: string; active: boolean }

// Referral tracking v1 — deliberately no automated reward here. Billing
// enforcement is still off and Stripe is still test-mode, so there's no
// live subscription to apply a credit against yet; rewards for now are
// applied manually. This just makes sure every referral from here on is
// actually captured, so nothing is lost once a real reward mechanism
// exists. See scripts/2026-10-28-referral-program.sql.
export function ReferralCard() {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [items, setItems] = useState<ReferralItem[]>([])
  const [copied, setCopied] = useState(false)

  const load = async () => {
    const res = await fetch('/api/referrals/mine')
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setReferralCode(data.referralCode || null)
      setItems(data.items || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Hardcoded, not window.location.origin — same reasoning as every
  // other shareable link in this app: a link built from a preview
  // deployment URL lands behind Vercel's own login wall instead of the
  // real site.
  const link = referralCode ? `https://www.prophandld.com/signup?role=landlord&ref=${referralCode}` : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  if (loading) return null

  return (
    <ScrollReveal className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-1">{t('inviteAndEarnTitle', lang)}</h2>
      <p className="text-white/50 text-sm mb-4">{t('inviteAndEarnDesc', lang)}</p>

      <div className="flex items-center gap-2 mb-5">
        <input
          readOnly
          value={link}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white/70 text-sm truncate focus:outline-none"
        />
        <RippleButton
          onClick={copyLink}
          className="shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition"
        >
          {copied ? t('copiedLabel', lang) : t('copyLinkBtn', lang)}
        </RippleButton>
      </div>

      {items.length === 0 ? (
        <p className="text-white/40 text-sm">{t('noReferralsYet', lang)}</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm bg-white/3 border border-white/8 rounded-xl px-4 py-2.5">
              <span className="text-white/80">{r.referredName}</span>
              <span className={
                r.active
                  ? 'text-[11px] font-semibold rounded-full px-2.5 py-1 bg-[#0A7B7E]/20 text-[#12A5A9]'
                  : 'text-[11px] font-semibold rounded-full px-2.5 py-1 bg-white/8 text-white/50'
              }>
                {r.active ? t('referralActiveStatus', lang) : t('referralPendingStatus', lang)}
              </span>
            </div>
          ))}
        </div>
      )}
    </ScrollReveal>
  )
}
