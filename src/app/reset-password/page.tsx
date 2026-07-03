'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/login'), 2000)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Set new password</h1>
          <p className="text-white/50 text-sm mt-1">Choose a strong password</p>
        </div>

        {done ? (
          <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-6 py-5 text-center">
            <p className="text-[#12A5A9] font-medium">Password updated!</p>
            <p className="text-white/50 text-sm mt-1">Redirecting to login...</p>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-1">New password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#12A5A9] transition"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}