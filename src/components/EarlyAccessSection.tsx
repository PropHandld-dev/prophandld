'use client'

import { useState } from 'react'
import { MailIcon, CheckCircleIcon } from '@/components/icons'

// Replaces the old "in-person launch event" pitch (LaunchEventSection) —
// an external note correctly flagged that promising an in-person Philly
// meetup read as a stall tactic once the real app was already live and
// signup-ready. Same working email-capture mechanic, different ask: get
// early access rather than wait for an event with no date.
export function EarlyAccessSection() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('submitting')
    setError(null)
    try {
      const res = await fetch('/api/early-access-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save your email. Please try again.')
        setStatus('error')
        return
      }
      setStatus('done')
    } catch {
      setError('Could not save your email. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#0A7B7E]/15 via-white/3 to-white/3 border border-[#12A5A9]/25 rounded-3xl p-8 sm:p-12 text-center">
      <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 text-[#12A5A9] border border-[#12A5A9]/30 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
        <MailIcon className="w-3.5 h-3.5" />
        Early access
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Want early access?</h2>
      <p className="text-white/60 max-w-xl mx-auto leading-relaxed mb-8">
        Leave your email and we&apos;ll reach out as new features and markets open up &mdash;
        no spam, just the occasional update worth knowing about.
      </p>

      {status === 'done' ? (
        <div className="inline-flex items-center gap-2 text-[#12A5A9] font-semibold">
          <CheckCircleIcon className="w-5 h-5" />
          You&apos;re on the list. We&apos;ll be in touch.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
          <input
            type="email"
            required
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full bg-white/5 border border-white/10 rounded-full px-5 py-3 text-white placeholder-white/40 text-sm focus:outline-none focus:border-[#12A5A9] transition"
          />
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full sm:w-auto shrink-0 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 transition disabled:opacity-50"
          >
            {status === 'submitting' ? 'Saving...' : 'Count me in'}
          </button>
        </form>
      )}
      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
    </div>
  )
}
