'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RippleButton } from '@/components/RippleButton'
import { useLanguage, t } from '@/lib/i18n'
import { useConfirm } from '@/lib/useConfirm'

type Passkey = { id: string; friendly_name?: string | null; created_at: string }

// Optional Face ID / Touch ID / Windows Hello sign-in via Supabase Auth's
// passkey support — still beta as of this writing (Supabase: "the API may
// change without notice"), which is exactly why this is offered as an
// extra, faster unlock alongside password rather than a replacement for
// it: password stays the required primary method everywhere else in the
// app (2FA disable, payout re-auth, etc. all still use it), so nothing
// breaks if this beta API changes later — only this optional path would.
// Requires the one-time dashboard setup (Authentication → Passkeys) and
// the client-side experimental.passkey opt-in in lib/supabase.ts.
export function PasskeyCard() {
  const lang = useLanguage()
  const [loading, setLoading] = useState(true)
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  // Real bug this exact gap caused: passkey support is still beta, and
  // until the one-time Supabase Dashboard setup is confirmed done, calling
  // any of these methods can throw synchronously (the method genuinely
  // doesn't exist on the client yet) rather than reject as a normal
  // {error} result — which, unguarded, happened before setLoading(false)
  // ever ran, so this card got stuck on its loading skeleton forever on
  // every single Profile page visit, for every role, not just whoever
  // tried to use the feature. Every call below is now wrapped so a
  // missing/failing method degrades to a visible error instead of an
  // unhandled throw that leaves the UI stuck.
  const refresh = async () => {
    try {
      const { data, error: listError } = await (supabase.auth as any).passkey.list()
      if (!listError) setPasskeys(data?.passkeys || data || [])
      else setError(listError.message || t('couldNotAddPasskey', lang))
    } catch {
      // Beta API not actually available yet (dashboard setup not done,
      // or this browser doesn't support WebAuthn) — fail quietly here;
      // the Add button below will surface a clear error if someone
      // actually tries to use it.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleAdd = async () => {
    setRegistering(true)
    setError(null)
    try {
      const { error: registerError } = await (supabase.auth as any).registerPasskey()
      if (registerError) {
        setError(registerError.message || t('couldNotAddPasskey', lang))
        return
      }
      await refresh()
    } catch {
      setError(t('couldNotAddPasskey', lang))
    } finally {
      setRegistering(false)
    }
  }

  const handleRemove = async (passkeyId: string) => {
    if (!(await confirm({ body: t('removePasskeyConfirm', lang), danger: true }))) return
    try {
      await (supabase.auth as any).passkey.delete({ passkeyId })
      await refresh()
    } catch {
      setError(t('couldNotAddPasskey', lang))
    }
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-2">{t('passkeyCardTitle', lang)}</h2>
      <p className="text-white/60 text-sm mb-4">{t('passkeyCardDesc', lang)}</p>

      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

      {!loading && passkeys.length > 0 && (
        <div className="space-y-2 mb-4">
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center justify-between gap-3 bg-white/5 rounded-xl px-4 py-3">
              <span className="text-white/80 text-sm truncate">{pk.friendly_name || t('passkeyDefaultName', lang)}</span>
              <button
                onClick={() => handleRemove(pk.id)}
                className="text-white/40 hover:text-red-400 text-xs font-semibold transition shrink-0"
              >
                {t('removeBtn', lang)}
              </button>
            </div>
          ))}
        </div>
      )}

      <RippleButton
        onClick={handleAdd}
        disabled={registering || loading}
        className="bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
      >
        {registering ? t('passkeyRegisteringDots', lang) : t('addPasskeyBtn', lang)}
      </RippleButton>

      {ConfirmDialog}
    </div>
  )
}
