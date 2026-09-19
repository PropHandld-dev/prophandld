'use client'

import { useState } from 'react'
import { RippleButton } from '@/components/RippleButton'

export function RaiseDisputeButton({ jobId, onRaised }: { jobId: string; onRaised: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Please explain the issue.')
      return
    }

    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/disputes/raise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, reason }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not raise a dispute.')
      setSubmitting(false)
      return
    }

    setOpen(false)
    setReason('')
    setSubmitting(false)
    onRaised()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-red-400/70 hover:text-red-400 text-xs transition"
      >
        Raise a dispute
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0F2138] border border-white/10 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-semibold text-lg mb-2">Raise a dispute</h3>
            <p className="text-white/60 text-sm mb-4">
              This pauses the job and brings in Prophandld to review. Explain what&apos;s wrong.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="What happened?"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none"
              />
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <div className="flex items-center gap-3">
                <RippleButton
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-red-500/20 text-red-400 font-semibold py-3 rounded-xl hover:bg-red-500/30 transition disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit dispute'}
                </RippleButton>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="text-white/50 hover:text-white text-sm transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
