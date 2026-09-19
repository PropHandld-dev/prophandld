'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BottomTabBar } from '@/components/BottomTabBar'
import { Skeleton } from '@/components/Skeleton'
import { LANDLORD_TABS } from '@/lib/navTabs'
import { ScrollReveal } from '@/components/ScrollReveal'
import { RippleButton } from '@/components/RippleButton'

export default function InviteContractorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [invites, setInvites] = useState<any[]>([])
  const [form, setForm] = useState({ email: '', note: '' })

  const loadInvites = async () => {
    const { data } = await supabase
      .from('contractor_invites')
      .select('*')
      .order('created_at', { ascending: false })
    setInvites(data || [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      await loadInvites()
      setLoading(false)
    }
    init()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email.trim()) return

    setSending(true)
    setError(null)
    setSuccess(null)

    const res = await fetch('/api/invite-contractor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.trim(), note: form.note.trim() || undefined }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error || 'Could not send invite.')
      setSending(false)
      return
    }

    setSuccess(`Invite sent to ${form.email.trim()}.`)
    setForm({ email: '', note: '' })
    await loadInvites()
    setSending(false)
  }

  const handleCancel = async (inviteId: string) => {
    await supabase.from('contractor_invites').update({ status: 'cancelled' }).eq('id', inviteId)
    await loadInvites()
  }

  const statusLabel = (status: string) => {
    if (status === 'accepted') return { label: 'Joined', className: 'bg-[#0A7B7E]/20 text-[#12A5A9]' }
    if (status === 'cancelled') return { label: 'Cancelled', className: 'bg-white/8 text-white/50' }
    return { label: 'Waiting to sign up', className: 'bg-yellow-500/15 text-yellow-400' }
  }

  return (
    <div className="min-h-screen bg-[#0C1A2E]">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <Link href="/landlord" className="text-white/50 hover:text-white text-sm transition">
          ← Dashboard
        </Link>
        <Link href="/landlord" className="text-white font-semibold text-sm hover:opacity-80 transition">Prophandld</Link>
        <div className="w-20" />
      </nav>

      <main className="max-w-xl mx-auto px-6 py-10 pb-28">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64 mb-6" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Invite a contractor</h1>
            <p className="text-white/50 text-sm mb-8">
              Know a contractor who isn&apos;t on Prophandld yet? Invite them by email — once they sign up, you can message them and post jobs their way.
            </p>

            <ScrollReveal>
              <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 space-y-4 mb-8">
                <div>
                  <label className="text-white/70 text-sm block mb-1">Contractor&apos;s email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    placeholder="them@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition"
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm block mb-1">Note (optional)</label>
                  <textarea
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    rows={2}
                    placeholder="e.g. I've got a few plumbing jobs coming up"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:border-[#12A5A9] transition resize-none"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
                )}
                {success && (
                  <div className="bg-[#0A7B7E]/15 border border-[#12A5A9]/30 rounded-xl px-4 py-3 text-[#12A5A9] text-sm">{success}</div>
                )}

                <RippleButton
                  type="submit"
                  disabled={sending}
                  className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white font-semibold py-3 rounded-xl transition hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send invite'}
                </RippleButton>
              </form>
            </ScrollReveal>

            {invites.length > 0 && (
              <div>
                <h2 className="text-white font-semibold text-sm mb-3">Your invites</h2>
                <div className="space-y-2">
                  {invites.map((invite) => {
                    const status = statusLabel(invite.status)
                    return (
                      <div key={invite.id} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white text-sm truncate">{invite.contractor_email}</p>
                          {invite.note && <p className="text-white/40 text-xs truncate mt-0.5">{invite.note}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs rounded-full px-2.5 py-0.5 ${status.className}`}>{status.label}</span>
                          {invite.status === 'pending' && (
                            <button
                              onClick={() => handleCancel(invite.id)}
                              className="text-red-400/70 hover:text-red-400 text-xs transition"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <BottomTabBar tabs={LANDLORD_TABS} />
    </div>
  )
}
