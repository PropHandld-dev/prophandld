'use client'

import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/AdminLayout'
import { ScrollReveal } from '@/components/ScrollReveal'

type Health = {
  stripe: {
    keyPresent: boolean
    mode: 'live' | 'test' | 'unrecognized' | 'not_set'
    connectionOk: boolean
    connectionError: string | null
    webhookSecretPresent: boolean
    priceConfigured: boolean
    priceResolvesOk: boolean
    priceError: string | null
  }
  twilio: { accountSidPresent: boolean; authTokenPresent: boolean; phoneNumberPresent: boolean }
  resend: { apiKeyPresent: boolean }
  frozenPayoutAccounts: { id: string; name: string; email: string; frozenUntil: string }[]
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-[#12A5A9]' : 'bg-red-400'}`} />
  )
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5">
        <StatusDot ok={ok} />
        <span className="text-white/80 text-sm">{label}</span>
      </div>
      {detail && <span className="text-white/40 text-xs text-right max-w-xs">{detail}</span>}
    </div>
  )
}

export default function AdminHealthPage() {
  const [data, setData] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const accessCheck = await fetch('/api/admin/check-access').then((r) => r.json()).catch(() => ({ authorized: false }))
      if (!accessCheck.authorized) {
        setLoading(false)
        return
      }
      const res = await fetch('/api/admin/system-health')
      const json = await res.json()
      if (json.error) setError(json.error)
      else setData(json)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-2">System health</h1>
      <p className="text-white/50 text-sm mb-8">
        Whether the real integrations (Stripe, Twilio, Resend) are actually configured and reachable right now — built so a bad key shows up here, not on a landlord&apos;s payment screen.
      </p>

      {loading ? (
        <div className="text-white/50 text-sm">Loading...</div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      ) : !data ? null : (
        <>
          <ScrollReveal>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-sm">Stripe</h2>
                <span className={
                  data.stripe.mode === 'live'
                    ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400'
                    : data.stripe.mode === 'test'
                      ? 'text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400'
                      : 'text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/50'
                }>
                  {data.stripe.mode === 'live' ? 'LIVE MODE' : data.stripe.mode === 'test' ? 'Test mode' : data.stripe.mode === 'not_set' ? 'Not configured' : 'Unrecognized key'}
                </span>
              </div>
              <Row label="Secret key present" ok={data.stripe.keyPresent} />
              <Row
                label="Can actually reach Stripe's API"
                ok={data.stripe.connectionOk}
                detail={data.stripe.connectionError || (data.stripe.connectionOk ? 'Confirmed with a live balance check' : undefined)}
              />
              <Row label="Webhook secret present" ok={data.stripe.webhookSecretPresent} />
              <Row
                label="Subscription price configured and resolves"
                ok={data.stripe.priceConfigured && data.stripe.priceResolvesOk}
                detail={data.stripe.priceError || (!data.stripe.priceConfigured ? 'STRIPE_PRICE_GRADUATED not set' : undefined)}
              />
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
              <h2 className="text-white font-semibold text-sm mb-4">Twilio (SMS)</h2>
              <Row label="Account SID present" ok={data.twilio.accountSidPresent} />
              <Row label="Auth token present" ok={data.twilio.authTokenPresent} />
              <Row label="Phone number present" ok={data.twilio.phoneNumberPresent} />
              {!data.twilio.accountSidPresent && (
                <p className="text-white/40 text-xs mt-3">Expected — SMS setup is in progress, not live yet.</p>
              )}
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-6">
              <h2 className="text-white font-semibold text-sm mb-4">Resend (email)</h2>
              <Row label="API key present" ok={data.resend.apiKeyPresent} />
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-sm">Frozen payout accounts</h2>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-white/50">{data.frozenPayoutAccounts.length}</span>
              </div>
              {data.frozenPayoutAccounts.length === 0 ? (
                <p className="text-white/40 text-sm">Nobody is currently frozen.</p>
              ) : (
                <div className="space-y-2">
                  {data.frozenPayoutAccounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <span className="text-white/80">{a.name} · {a.email}</span>
                      <span className="text-yellow-400 text-xs" suppressHydrationWarning>until {new Date(a.frozenUntil).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-white/40 text-xs mt-3">
                A landlord or contractor lands here for 48 hours after their Stripe payout bank account changes — routine fraud guard, not necessarily a problem.
              </p>
            </div>
          </ScrollReveal>
        </>
      )}
    </AdminLayout>
  )
}
