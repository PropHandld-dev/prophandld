'use client'

import { useState } from 'react'
import { HelpCircleIcon } from '@/components/icons'

type Role = 'general' | 'landlord' | 'renter' | 'contractor'

const ROLE_TABS: { key: Role; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'landlord', label: 'Landlord' },
  { key: 'renter', label: 'Renter' },
  { key: 'contractor', label: 'Contractor' },
]

const FAQS: Record<Role, { q: string; a: string }[]> = {
  general: [
    {
      q: 'What is Prophandld?',
      a: 'Mini property management for landlords who own a few units, not a few hundred — plus the tenants and contractors connected to those properties. One place to track properties, handle maintenance through sealed bidding, and collect rent.',
    },
    {
      q: 'Where is Prophandld available?',
      a: 'We’re currently onboarding landlords in the Philadelphia area, with more areas planned as we grow.',
    },
    {
      q: 'What happens if a job goes wrong?',
      a: 'Any party can raise a dispute within 48 hours of the job being marked done, and Prophandld’s team reviews it and resolves it — the job is paused until it’s sorted out.',
    },
  ],
  landlord: [
    {
      q: 'How does bidding work?',
      a: 'Post a job and contractors submit sealed bids — nobody sees anyone else’s price. You pick whoever you trust most, not just the lowest number.',
    },
    {
      q: 'How much does it cost?',
      a: 'Free for 1–2 units. $20/mo for 3–5 units, $50/mo for 6–10, and $80/mo for 11+. That\'s the only fee — no per-job cut on top.',
    },
    {
      q: 'Do contractors need a license?',
      a: 'Contractors can optionally submit license and insurance for a "Verified" badge, but unlicensed contractors can also use the platform — they\'re just labeled as unverified so you can decide.',
    },
    {
      q: 'Can I message my tenants or contractors directly?',
      a: 'Yes — message any active tenant or any contractor you\'ve worked with before, with or without an open job. Handy for a quick "you around Thursday?" without waiting on a new job to exist.',
    },
    {
      q: 'How does rent collection work?',
      a: 'Rent tracks itself every month — tenants pay by debit card or bank transfer, no checks or cash to chase down, and you get one tap to mark a payment received if it came in outside the app.',
    },
  ],
  renter: [
    {
      q: 'Is paying rent through Prophandld safe?',
      a: 'Yes — rent is paid by debit card or bank transfer through Stripe, the same payment processor used by most major platforms. Prophandld never sees or stores your card details. Credit cards aren\'t accepted for rent, on purpose, so you\'re not tempted into card debt to make rent.',
    },
    {
      q: 'How do I report a maintenance issue?',
      a: 'A couple taps from your dashboard — category, a photo, a short description. Your landlord is notified right away.',
    },
    {
      q: 'Can I message my landlord directly?',
      a: 'Yes, anytime — you don\'t need an open maintenance issue to reach out.',
    },
    {
      q: 'What if my issue is an emergency?',
      a: 'Flag it as an emergency when you report it and it\'s treated with priority — just use it for things that actually can\'t wait, the app will show you what qualifies.',
    },
  ],
  contractor: [
    {
      q: 'How does bidding work for me?',
      a: 'You submit a sealed bid on a job — your price, availability, and notes — without seeing what anyone else bid. The landlord picks based on trust and value, not just who\'s cheapest.',
    },
    {
      q: 'Does it cost anything to use Prophandld?',
      a: 'No — there\'s no platform fee for contractors. You keep what you\'re paid for the job.',
    },
    {
      q: 'Do I need to be licensed to bid?',
      a: 'No — unlicensed contractors can bid too, you\'re just labeled as unverified so landlords can decide. Submitting license and insurance gets you a "Verified" badge, which some landlords weight heavily.',
    },
    {
      q: 'How do jobs get matched to me?',
      a: 'By the categories you service and a travel radius around your ZIP code, not an exact-address match — so you\'ll see jobs anywhere reasonably close, not just next door.',
    },
    {
      q: 'How and when do I get paid?',
      a: 'Directly through the platform once the job\'s marked complete and approved — money moves straight from the landlord to you via Stripe, Prophandld never holds it.',
    },
  ],
}

export function LandingHelpWidget() {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<Role>('general')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const selectRole = (r: Role) => {
    setRole(r)
    setExpanded(null)
  }

  const submit = async () => {
    if (!email.trim() || !question.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/support-escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), question: question.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-x-4 bottom-24 sm:inset-x-auto sm:right-5 sm:w-96 z-50 motion-safe:animate-[floatUp_0.25s_ease-out]"
          style={{ transformOrigin: 'bottom right' }}
        >
          <div className="bg-[#0F2138]/97 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[70vh] sm:max-h-[520px]">
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/8 shrink-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] flex items-center justify-center shrink-0">
                <HelpCircleIcon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-semibold">Questions?</p>
                <p className="text-white/60 text-xs">Common questions, answered</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-lg leading-none transition shrink-0">
                ×
              </button>
            </div>

            <div className="flex items-center gap-1.5 px-3 pt-3 pb-1 shrink-0 overflow-x-auto">
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => selectRole(tab.key)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition ${
                    role === tab.key
                      ? 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white'
                      : 'bg-white/5 text-white/50 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
              {role === 'general' && (
                <div className="bg-gradient-to-r from-[#0A7B7E]/15 to-[#12A5A9]/15 border border-[#12A5A9]/20 rounded-xl px-3.5 py-3 mb-1">
                  <p className="text-white text-sm leading-relaxed">
                    👋 Hi there! Pick your role above for questions specific to you, or browse the general basics below.
                  </p>
                </div>
              )}
              {FAQS[role].map((f, i) => (
                <div key={f.q} className="bg-white/5 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    className="w-full text-left flex items-center justify-between gap-2 px-3.5 py-3"
                  >
                    <span className="text-white text-sm font-medium">{f.q}</span>
                    <span className={`text-white/60 text-xs shrink-0 transition-transform ${expanded === i ? 'rotate-45' : ''}`}>+</span>
                  </button>
                  {expanded === i && (
                    <p className="text-white/55 text-sm leading-relaxed px-3.5 pb-3.5">{f.a}</p>
                  )}
                </div>
              ))}

              <div className="pt-2">
                {!showForm ? (
                  <button
                    onClick={() => setShowForm(true)}
                    className="w-full text-center text-[#12A5A9] text-xs font-semibold bg-[#12A5A9]/10 hover:bg-[#12A5A9]/15 rounded-xl py-2.5 transition"
                  >
                    Have a different question? →
                  </button>
                ) : status === 'sent' ? (
                  <div className="bg-white/5 rounded-xl p-3.5">
                    <p className="text-white/70 text-xs">Sent to our team — we’ll follow up at {email}. Check your email for confirmation.</p>
                  </div>
                ) : (
                  <div className="bg-white/5 rounded-xl p-3.5 space-y-2">
                    <p className="text-white/50 text-xs">We’ll email your question to our team and confirm by email.</p>
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="What do you want to know?"
                      maxLength={2000}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-[#12A5A9]/50 resize-none"
                    />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-[#12A5A9]/50"
                    />
                    {status === 'error' && <p className="text-red-400 text-xs">Couldn’t send — try again.</p>}
                    <button
                      onClick={submit}
                      disabled={status === 'sending' || !email.trim() || !question.trim()}
                      className="w-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-xs font-semibold rounded-lg py-2 disabled:opacity-50 transition"
                    >
                      {status === 'sending' ? 'Sending…' : 'Send to our team'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] shadow-[0_10px_30px_-8px_rgba(18,165,169,0.6)] flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform motion-safe:animate-[floatUp_0.3s_ease-out]"
        aria-label="Questions"
      >
        {open ? <span className="text-2xl leading-none">×</span> : <HelpCircleIcon className="w-6 h-6" />}
      </button>
    </>
  )
}
