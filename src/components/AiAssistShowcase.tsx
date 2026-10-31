'use client'

import { useEffect, useRef, useState } from 'react'
import {
  WrenchIcon, FileTextIcon, MessageCircleIcon, ClipboardListIcon, DollarSignIcon, BuildingIcon,
} from '@/components/icons'

// Real conversation shape, lightly trimmed for length — not a fabricated
// quote, this is the actual back-and-forth AI Assist produces for this
// exact scenario (verified live against production the same day this
// section was written). No contractor turn in here on purpose: AI Assist
// is a landlord add-on for landlords and their renters, not a contractor
// feature (see TroubleshootAssistant/DiyTroubleshootPanel/polish-bid).
const TRANSCRIPT = [
  { role: 'user' as const, text: 'The washer makes a loud banging noise during the spin cycle.' },
  { role: 'ai' as const, text: "Banging during spin is usually just an unbalanced load. Pause the cycle, spread the clothes out evenly around the drum, and run it again." },
  { role: 'user' as const, text: "Still banging, what else can I try?" },
  { role: 'ai' as const, text: "Check whether the washer's level — press each corner and see if it rocks. Still banging after that? Totally fine to report it. Nothing here's a guarantee." },
]

const FEATURES = [
  {
    icon: WrenchIcon,
    title: 'Talks a tenant through it first',
    desc: "Reads what they typed and the photo they attached, suggests one safe thing to try at a time, and keeps going until there's nothing left to try. Won't go near electrical, gas, or structural. Ever.",
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
]

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

// A chat demo, not a screenshot — same reasoning RoleShowcase already
// applies to the dashboard mockups further up the page: a real screenshot
// goes stale the moment the UI changes, a hand-built version with a
// verified-real transcript doesn't. Plays the transcript on a loop so a
// visitor who lands mid-scroll still sees the point land, not a frozen
// half-conversation.
function ChatDemo() {
  const [visible, setVisible] = useState(0)
  const [typing, setTyping] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setVisible(TRANSCRIPT.length)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const step = (i: number) => {
      if (cancelled) return
      if (i >= TRANSCRIPT.length) {
        timer = setTimeout(() => { setVisible(0); step(0) }, 3200)
        return
      }
      const isAi = TRANSCRIPT[i].role === 'ai'
      if (isAi) setTyping(true)
      timer = setTimeout(() => {
        if (cancelled) return
        setTyping(false)
        setVisible(i + 1)
        timer = setTimeout(() => step(i + 1), isAi ? 1400 : 700)
      }, isAi ? 900 : 100)
    }
    step(0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [reducedMotion])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visible, typing])

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0F2138] shadow-[0_40px_120px_-40px_rgba(18,165,169,0.35)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8 bg-white/[0.02]">
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-white/50 text-xs">AI Assist · Washer or Dryer</span>
      </div>
      <div ref={listRef} className="p-5 sm:p-6 space-y-2.5 min-h-[320px]">
        {TRANSCRIPT.slice(0, visible).map((turn, i) => (
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
    </div>
  )
}

export function AiAssistShowcase() {
  return (
    <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
      <div>
        <ChatDemo />
        <p className="text-white/40 text-xs text-center mt-4">A real conversation shape, shown with example data</p>
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
  )
}
