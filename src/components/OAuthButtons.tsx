'use client'

import { useState } from 'react'
import { startOAuth, type OAuthProvider } from '@/lib/oauth'

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.07-1.47-.22-2.12H12v3.85h6.56c-.13 1.09-.84 2.73-2.42 3.84l-.02.15 3.52 2.73.24.02c2.24-2.07 3.64-5.11 3.64-8.47Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.78-2.93c-1.01.71-2.37 1.2-4.15 1.2-3.17 0-5.86-2.09-6.82-4.98l-.14.01-3.68 2.85-.05.14C3.31 21.3 7.33 24 12 24Z" />
      <path fill="#FBBC05" d="M5.18 14.38A7.4 7.4 0 0 1 4.77 12c0-.83.14-1.63.4-2.38l-.01-.16-3.73-2.9-.12.06A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.31 5.38l3.87-3Z" />
      <path fill="#EA4335" d="M12 4.75c2.25 0 3.77.97 4.64 1.79l3.39-3.31C17.94 1.19 15.24 0 12 0 7.33 0 3.31 2.7 1.31 6.62l3.86 3C6.14 6.84 8.83 4.75 12 4.75Z" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.37 1.43c.09 1.1-.33 2.18-.98 2.98-.68.83-1.8 1.46-2.9 1.37-.12-1.06.4-2.17 1.02-2.93.69-.84 1.9-1.47 2.86-1.42ZM20.5 17.32c-.56 1.29-.82 1.86-1.54 3-1.01 1.58-2.44 3.55-4.21 3.57-1.57.02-1.97-1.02-4.1-1.01-2.12.01-2.56 1.03-4.13 1.01-1.77-.02-3.12-1.79-4.13-3.37C-.07 16.71-.4 12.03 1.56 9.6c1.03-1.28 2.63-2.08 4.14-2.08 1.63 0 2.65 1.02 4 1.02 1.3 0 2.1-1.03 4-1.03 1.24 0 2.72.68 3.78 1.85a5.2 5.2 0 0 0-2.49 4.38c0 2.33 1.65 3.84 3.51 3.58Z" />
    </svg>
  )
}

// Shared by signup and login — same providers, same buttons, different
// caller supplies different params (signup carries role/intent/ref for a
// brand-new account, login doesn't need to since an existing account's
// app_metadata.role already wins; see oauth.ts and /auth/callback).
export function OAuthButtons({
  role,
  intent,
  referrerId,
  disabled,
}: {
  role?: string
  intent?: string
  referrerId?: string
  // Signup only: true until the Terms/Privacy checkbox is checked.
  // Caught in testing -- these buttons used to sit above the signup form
  // entirely and fired immediately on click, so a brand-new OAuth
  // account could be created without ever agreeing to anything, the
  // exact thing the form's own submit button was already gated on.
  disabled?: boolean
}) {
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async (provider: OAuthProvider) => {
    setLoadingProvider(provider)
    setError(null)
    const { error: oauthError } = await startOAuth(provider, { role, intent, referrerId })
    if (oauthError) {
      setError(oauthError.message)
      setLoadingProvider(null)
    }
    // On success the browser navigates away to the provider immediately —
    // nothing left to do here.
  }

  return (
    <div className="space-y-2.5">
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      <button
        type="button"
        onClick={() => handleClick('google')}
        disabled={disabled || loadingProvider !== null}
        className="w-full flex items-center justify-center gap-2.5 bg-white text-[#1F1F1F] text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-white/90 transition disabled:opacity-50"
      >
        <GoogleIcon />
        {loadingProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </button>
      <button
        type="button"
        onClick={() => handleClick('apple')}
        disabled={disabled || loadingProvider !== null}
        className="w-full flex items-center justify-center gap-2.5 bg-black text-white text-sm font-semibold px-4 py-2.5 rounded-xl border border-white/15 hover:bg-black/80 transition disabled:opacity-50"
      >
        <AppleIcon />
        {loadingProvider === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
      </button>
    </div>
  )
}
