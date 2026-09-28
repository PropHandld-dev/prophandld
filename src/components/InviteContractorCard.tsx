'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RippleButton } from '@/components/RippleButton'
import { WrenchIcon, CheckCircleIcon } from '@/components/icons'
import { useLanguage, t } from '@/lib/i18n'

// The single highest-leverage growth mechanic this app has: every landlord
// who invites their own contractor both organizes their own work AND, for
// free, seeds the contractor side of the marketplace — the side that
// actually determines whether sealed bidding ever produces a bid. Used to
// exist only as two small text links buried inside the DM composer, which
// meant almost nobody found it. Right on the dashboard, one field, so
// sending an invite costs a landlord nothing more than typing an email.
export function InviteContractorCard() {
  const lang = useLanguage()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || sending) return
    setSending(true)
    setError(null)

    const res = await fetch('/api/invite-contractor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error || t('couldNotSendInvitePlain', lang))
      setSending(false)
      return
    }

    setSent(true)
    setEmail('')
    setSending(false)
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-white/3 border border-[#12A5A9]/25 rounded-2xl p-5 mb-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] flex items-center justify-center shrink-0">
          <WrenchIcon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold">{t('inviteCardHeading', lang)}</p>
          <p className="text-white/60 text-xs mt-0.5 mb-3">{t('inviteCardDesc', lang)}</p>

          {sent ? (
            <div className="flex items-center gap-2 text-[#12A5A9] text-sm font-medium">
              <CheckCircleIcon className="w-4 h-4 shrink-0" />
              {t('inviteCardSent', lang)}
              <button onClick={() => setSent(false)} className="text-white/50 hover:text-white text-xs underline underline-offset-2 ml-1">
                {t('inviteCardAnother', lang)}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={t('contractorsEmailPlaceholder', lang)}
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#12A5A9] transition"
              />
              <RippleButton
                type="submit"
                disabled={sending}
                className="text-sm font-semibold bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white px-4 py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50 shrink-0"
              >
                {sending ? t('sendingDots', lang) : t('inviteCardSendBtn', lang)}
              </RippleButton>
            </form>
          )}
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

          <Link href="/landlord/contractors/invite" className="block text-white/40 hover:text-white/70 text-xs mt-3 transition">
            {t('inviteCardManageLink', lang)}
          </Link>
        </div>
      </div>
    </div>
  )
}
