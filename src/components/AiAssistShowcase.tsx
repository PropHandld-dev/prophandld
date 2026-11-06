'use client'

import { useEffect, useRef, useState } from 'react'
import {
  WrenchIcon, FileTextIcon, MessageCircleIcon, ClipboardListIcon, DollarSignIcon, BuildingIcon,
  CheckCircleIcon, BellIcon,
} from '@/components/icons'

type Audience = 'tenant' | 'landlord'

// Real conversation shape, lightly trimmed for length — not a fabricated
// quote, this is the actual back-and-forth AI Assist produces for this
// exact scenario (verified live against production the same day this
// section was written). No contractor turn in here on purpose: AI Assist
// is a landlord add-on for landlords and their renters, not a contractor
// feature (see TroubleshootAssistant/DiyTroubleshootPanel/polish-bid).
// The brand/model callout is real too, not embellishment — a unit's
// tracked appliances (Systems & appliances) get matched automatically and
// handed to the AI as "already known, don't ask for it again" (see
// knownApplianceLine in troubleshoot/route.ts), so a tenant never has to
// type their washer's model number themselves.
const TENANT_TRANSCRIPT = [
  { role: 'user' as const, text: 'The washer makes a loud banging noise during the spin cycle.' },
  { role: 'ai' as const, text: "I can see the Samsung washer on file for this unit (model WF45T6000AW). Banging during spin on that model is usually just an unbalanced load. Pause the cycle, spread the clothes out evenly, and run it again." },
  { role: 'user' as const, text: "Still banging, what else can I try?" },
  { role: 'ai' as const, text: "Check whether it's level. Samsung's own guidance for this model is to adjust the rear feet first. Still banging after that? Totally fine to report it. Nothing here's a guarantee." },
]

// Same property names already used in RoleShowcase's own mockups further
// up the page (123 Oak St, 456 Elm Ave, fire extinguisher at 12 days) —
// one consistent example portfolio across the whole landing page, not a
// different fake address every time AI gets demoed.
const LANDLORD_DIGEST = [
  { icon: ClipboardListIcon, text: 'Fire extinguisher inspection at 456 Elm Ave expires in 12 days, worth getting ahead of it.' },
  { icon: DollarSignIcon, text: '2 new bids came in overnight on the Oak St kitchen sink leak.' },
  { icon: FileTextIcon, text: "Read renewal-2026.pdf for 789 Pine St: rent $1,850, 3%/yr escalation, 1 dog on file. Fields filled in for you." },
]

const FEATURES = [
  {
    icon: WrenchIcon,
    title: 'Talks a tenant through it first',
    desc: "Already knows which washer, water heater, or HVAC unit it's looking at from what's tracked for that unit, reads the photo they attached, and suggests one safe thing to try at a time. Won't go near electrical, gas, or structural. Ever.",
  },
  {
    icon: FileTextIcon,
    title: 'Reads your paperwork so you don’t have to',
    desc: 'Upload a lease or a compliance certificate and the fields fill themselves in. A renewal gets a second look before you file it and forget it.',
  },
  {
    icon: MessageCircleIcon,
    title: "Answers the 11pm lease question",
    desc: "A renter asking about pets or late fees gets a real answer pulled from their actual lease, not a Google result. If it's not in the lease, it says so instead of guessing.",
  },
  {
    icon: ClipboardListIcon,
    title: 'Catches the gap before the inspector does',
    desc: "A quick read of what's on file for each property, flagging what's missing or about to lapse, while there's still time to do something about it.",
  },
  {
    icon: DollarSignIcon,
    title: 'Drafts the message you were going to write anyway',
    desc: 'A late-rent nudge, an access notice, a renewal offer, pre-written from your actual lease data. Edit it, send it, or bin it.',
  },
  {
    icon: BuildingIcon,
    title: 'A one-line morning briefing',
    desc: "What actually needs your attention across your whole portfolio, in a sentence, not a dashboard full of numbers you have to interpret yourself.",
  },
  {
    icon: CheckCircleIcon,
    title: 'A heads-up before contractors start skipping it',
    desc: "If a posted job's description is too thin to bid on confidently, you'll see a flag on it before it sits untouched for a week wondering why.",
  },
  {
    icon: BellIcon,
    title: "Quick replies when you're mid-conversation",
    desc: "A couple of smart suggestions for what to say next in any job chat or direct message, so you're not always starting from a blank box.",
  },
]

// How long a message stays alone on screen before the next one arrives —
// proportional to how long it actually takes to read, not a flat delay.
// Fixed at ~700ms/1400ms before, a visitor flagged the tenant demo as
// "going fast" — a 140-character AI reply was getting well under 2
// seconds, nowhere near enough to actually read it.
function readDelay(text: string) {
  return Math.min(Math.max(text.length * 32, 1400), 5500)
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-white/40 motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }}
        />
      ))}
    </span>
  )
}

function WindowChrome({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0F2138] shadow-[0_40px_120px_-40px_rgba(18,165,169,0.35)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8 bg-white/[0.02]">
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-white/50 text-xs">{label}</span>
      </div>
      <div className="p-5 sm:p-6 min-h-[320px] flex flex-col justify-center">{children}</div>
    </div>
  )
}

// A chat demo, not a screenshot — same reasoning RoleShowcase already
// applies to the dashboard mockups further up the page: a real screenshot
// goes stale the moment the UI changes, a hand-built version with a
// verified-real transcript doesn't. Plays the transcript on a loop so a
// visitor who lands mid-scroll still sees the point land, not a frozen
// half-conversation.
function TenantDemo() {
  const [visible, setVisible] = useState(0)
  const [typing, setTyping] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setVisible(TENANT_TRANSCRIPT.length)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const step = (i: number) => {
      if (cancelled) return
      if (i >= TENANT_TRANSCRIPT.length) {
        timer = setTimeout(() => { setVisible(0); step(0) }, 4000)
        return
      }
      const isAi = TENANT_TRANSCRIPT[i].role === 'ai'
      if (isAi) setTyping(true)
      timer = setTimeout(() => {
        if (cancelled) return
        setTyping(false)
        setVisible(i + 1)
        timer = setTimeout(() => step(i + 1), readDelay(TENANT_TRANSCRIPT[i].text))
      }, isAi ? 1100 : 150)
    }
    step(0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [reducedMotion])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visible, typing])

  return (
    <WindowChrome label="Prophandld AI · Samsung Washer (WF45T6000AW)">
      <div ref={listRef} className="space-y-2.5">
        {TENANT_TRANSCRIPT.slice(0, visible).map((turn, i) => (
          <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'} motion-safe:animate-[fadeIn_0.3s_ease-out]`}>
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[85%] bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-sm'
                  : 'max-w-[85%] bg-white/5 border border-white/10 text-white rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm'
              }
            >
              {turn.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <TypingDots />
            </div>
          </div>
        )}
      </div>
    </WindowChrome>
  )
}

// The landlord's own side of AI Assist, since the thing they're paying
// for isn't a chatbot for someone else — it's three different features
// (compliance watch, bid/job awareness, document extraction) landing as
// one morning digest. Reveals one line at a time, same pacing idea as the
// tenant chat, so it reads as "arriving," not a static list.
function LandlordDemo() {
  const [visible, setVisible] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(true)

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setVisible(LANDLORD_DIGEST.length)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const step = (i: number) => {
      if (cancelled) return
      if (i >= LANDLORD_DIGEST.length) {
        timer = setTimeout(() => { setVisible(0); step(0) }, 4500)
        return
      }
      timer = setTimeout(() => { if (!cancelled) { setVisible(i + 1); step(i + 1) } }, i === 0 ? 500 : readDelay(LANDLORD_DIGEST[i - 1].text))
    }
    step(0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [reducedMotion])

  return (
    <WindowChrome label="Prophandld AI · Morning digest">
      <div className="mb-4">
        <p className="text-white font-semibold text-sm">✦ Good morning</p>
        <p className="text-white/50 text-xs mt-0.5">Here&apos;s what&apos;s worth a look across your portfolio</p>
      </div>
      <div className="space-y-2.5">
        {LANDLORD_DIGEST.slice(0, visible).map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex items-start gap-3 bg-white/[0.03] border border-white/8 rounded-xl px-3.5 py-3 motion-safe:animate-[fadeIn_0.3s_ease-out]">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="w-3 h-3 text-[#12A5A9]" />
            </div>
            <p className="text-white/80 text-sm leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
    </WindowChrome>
  )
}

export function AiAssistShowcase() {
  const [audience, setAudience] = useState<Audience>('landlord')

  return (
    <div>
      <div className="flex items-center justify-center gap-2 mb-8">
        {([
          ['landlord', 'What you see'],
          ['tenant', 'What your tenants see'],
        ] as [Audience, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setAudience(value)}
            className={
              value === audience
                ? 'text-xs sm:text-sm font-semibold px-4 py-2 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white transition'
                : 'text-xs sm:text-sm font-semibold px-4 py-2 rounded-full bg-white/5 text-white/50 hover:bg-white/8 hover:text-white/80 transition'
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <div>
          {audience === 'landlord' ? <LandlordDemo /> : <TenantDemo />}
          <p className="text-white/40 text-xs text-center mt-4">
            {audience === 'landlord' ? 'A real digest shape, shown with example data' : 'A real conversation shape, shown with example data'}
          </p>
        </div>
        <div>
          <div className="grid sm:grid-cols-2 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E]/20 to-[#12A5A9]/20 border border-[#12A5A9]/30 flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4 text-[#12A5A9]" />
                </div>
                <h3 className="text-white font-semibold text-sm mb-1">{title}</h3>
                <p className="text-white/50 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
