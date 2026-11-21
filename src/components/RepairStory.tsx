'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircleIcon, LockIcon, WrenchIcon, HomeIcon, BuildingIcon, CalendarIcon, ReceiptIcon, StarIcon, MessageCircleIcon } from '@/components/icons'

// "One repair, three views": the landing page's main demo. A single sample
// job (a kitchen leak) walks through the five real steps, and the tenant,
// the landlord and the contractor each show what THEY see at that moment,
// side by side. Everything here is canned sample data, labelled as such;
// no network, no AI. Steps advance on their own until the visitor touches
// anything, and never under prefers-reduced-motion. On a phone, one view
// shows at a time with a switcher, so nothing is squeezed.

export type StoryStep = { key: string; label: string; time: string }
export type StoryView = { key: string; who: string; name: string; icon: typeof HomeIcon }
type View = 'tenant' | 'landlord' | 'contractor'

const STEPS: readonly StoryStep[] = [
  { key: 'report', label: 'Reported', time: 'Mon 8:12 AM' },
  { key: 'bids', label: 'Sealed bids', time: 'Mon 9:40 AM' },
  { key: 'schedule', label: 'Scheduled', time: 'Mon 2:05 PM' },
  { key: 'fixed', label: 'Fixed', time: 'Wed 11:20 AM' },
  { key: 'paid', label: 'Paid', time: 'Wed 6:02 PM' },
]

const VIEWS: StoryView[] = [
  { key: 'tenant', who: 'Tenant', name: 'Maria · Unit 2', icon: HomeIcon },
  { key: 'landlord', who: 'Landlord', name: 'Dana · 123 Oak St', icon: BuildingIcon },
  { key: 'contractor', who: 'Contractor', name: "Ray's Plumbing", icon: WrenchIcon },
]

const STEP_MS = 4200

export function RepairStory() {
  return <StoryDemo steps={STEPS} views={VIEWS} screens={SCREENS} defaultView="landlord" label="Sample repair · not real people" />
}

// The engine behind every "one thing, three views" demo: a step rail that
// plays while on screen (never under reduced motion), and one screen per
// person, side by side on desktop and switchable on a phone.
export function StoryDemo({
  steps: STEPS,
  views: VIEWS,
  screens,
  defaultView,
  label,
}: {
  steps: readonly StoryStep[]
  views: StoryView[]
  screens: Record<string, React.ReactNode[]>
  defaultView: string
  label: string
}) {
  const [step, setStep] = useState(0)
  const [view, setView] = useState<string>(defaultView)
  const [playing, setPlaying] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Only plays while on screen, and only for visitors who haven't asked
  // for reduced motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) return
    const id = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS)
    return () => clearTimeout(id)
  }, [playing, step])

  const stop = () => setPlaying(false)
  const go = (i: number) => { stop(); setStep(i) }

  return (
    <div ref={rootRef} onPointerDown={stop} className="relative">
      {/* Step rail */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden="true" /> {label}
        </span>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="text-xs font-semibold text-white/50 hover:text-white transition motion-reduce:hidden"
          aria-label={playing ? 'Pause the walkthrough' : 'Play the walkthrough'}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <ol className="grid grid-cols-5 gap-1.5 sm:gap-2 mb-6" aria-label="Steps of the repair">
        {STEPS.map((s, i) => {
          const done = i < step
          const current = i === step
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={current ? 'step' : undefined}
                className="group w-full text-left focus-visible:outline-none"
              >
                <span className="block h-1 rounded-full bg-white/10 overflow-hidden">
                  <span
                    key={current && playing ? `run-${step}` : `still-${i}-${done}`}
                    className={`block h-full rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] ${
                      done ? 'w-full' : current ? (playing ? 'w-0 animate-[storyFill_linear_forwards]' : 'w-full') : 'w-0'
                    }`}
                    style={current && playing ? { animationDuration: `${STEP_MS}ms` } : undefined}
                  />
                </span>
                <span className={`block mt-2 text-[11px] sm:text-xs font-semibold transition-colors ${current ? 'text-white' : done ? 'text-white/60' : 'text-white/35'} group-hover:text-white group-focus-visible:text-[#12A5A9]`}>
                  {s.label}
                </span>
                <span className="hidden sm:block text-[11px] text-white/35 tabular-nums">{s.time}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* Phone: one view at a time */}
      <div className="md:hidden grid grid-cols-3 gap-1 p-1 rounded-full bg-white/5 border border-white/8 mb-4" role="tablist" aria-label="Whose screen">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => { stop(); setView(v.key) }}
            className={`py-2 rounded-full text-xs font-semibold transition ${view === v.key ? 'bg-[#12A5A9] text-white' : 'text-white/60'}`}
          >
            {v.who}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {VIEWS.map((v) => (
          <ScreenFrame key={v.key} view={v} hiddenOnPhone={view !== v.key} step={step} content={screens[v.key]?.[step]} />
        ))}
      </div>
    </div>
  )
}

function ScreenFrame({ view, hiddenOnPhone, step, content }: { view: StoryView; hiddenOnPhone: boolean; step: number; content: React.ReactNode }) {
  const Icon = view.icon
  return (
    <div className={`${hiddenOnPhone ? 'max-md:hidden' : ''} rounded-[1.75rem] border border-white/10 bg-[#0C1A2E] p-2 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]`}>
      <div className="rounded-[1.35rem] bg-white/3 border border-white/5 overflow-hidden h-full flex flex-col">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-white/5">
          <span className="w-8 h-8 rounded-full bg-[#12A5A9]/15 text-[#12A5A9] grid place-items-center shrink-0"><Icon className="w-4 h-4" /></span>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">{view.who}</p>
            <p className="text-white/40 text-[11px] truncate">{view.name}</p>
          </div>
        </div>
        <div key={step} className="p-4 flex-1 flex flex-col gap-3 min-h-[300px] motion-safe:animate-[fadeIn_0.35s_ease-out]">
          {content}
        </div>
      </div>
    </div>
  )
}

// ---- Small building blocks for the fake screens ----

export function Status({ tone = 'teal', children }: { tone?: 'teal' | 'amber' | 'green' | 'muted'; children: React.ReactNode }) {
  const c = {
    teal: 'bg-[#12A5A9]/12 text-[#12A5A9] border-[#12A5A9]/25',
    amber: 'bg-amber-400/10 text-amber-300 border-amber-400/25',
    green: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/25',
    muted: 'bg-white/5 text-white/50 border-white/10',
  }[tone]
  return <span className={`self-start inline-flex items-center gap-1.5 text-[11px] font-semibold border rounded-full px-2.5 py-1 ${c}`}>{children}</span>
}

export function Card({ children, glow = false }: { children: React.ReactNode; glow?: boolean }) {
  return <div className={`rounded-xl border p-3 ${glow ? 'border-[#12A5A9]/35 bg-[#12A5A9]/8' : 'border-white/8 bg-white/3'}`}>{children}</div>
}

export function Btn({ children, ghost = false }: { children: React.ReactNode; ghost?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center text-xs font-semibold rounded-full px-3 py-1.5 ${ghost ? 'border border-white/15 text-white/70' : 'bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white'}`}>
      {children}
    </span>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-auto text-[11px] leading-relaxed text-white/45 border-t border-white/5 pt-3">{children}</p>
}

export function Photo({ label, tone }: { label: string; tone: 'before' | 'after' }) {
  return (
    <div className={`aspect-[4/3] rounded-lg grid place-items-end p-1.5 ${tone === 'before' ? 'bg-[radial-gradient(circle_at_40%_60%,rgba(59,130,246,0.45),rgba(30,41,59,0.9)_65%)]' : 'bg-[radial-gradient(circle_at_50%_40%,rgba(148,163,184,0.5),rgba(30,41,59,0.9)_70%)]'}`}>
      <span className="text-[10px] font-semibold text-[#fff] bg-black/40 rounded px-1.5 py-0.5">{label}</span>
    </div>
  )
}

export const Lock = () => <LockIcon className="w-3 h-3" />

// ---- What each person sees at each step ----

const SCREENS: Record<View, React.ReactNode[]> = {
  tenant: [
    <>
      <Card>
        <p className="text-white/40 text-[11px] mb-1">Report an issue</p>
        <p className="text-white text-sm leading-snug">&ldquo;Water is dripping under the kitchen sink. The cabinet floor is wet.&rdquo;</p>
        <div className="grid grid-cols-3 gap-1.5 mt-2.5"><Photo label="photo" tone="before" /></div>
      </Card>
      <Card glow>
        <p className="text-[#12A5A9] text-[11px] font-semibold mb-1">✦ Prophandld AI</p>
        <p className="text-white/80 text-xs leading-relaxed">Sounds like a supply-line leak. Not an emergency: close the valve under the sink and set a bowl there.</p>
      </Card>
      <Status tone="green"><CheckCircleIcon className="w-3 h-3" /> Sent to your landlord</Status>
      <Note>Takes about 30 seconds, in English or Spanish, with no phone call.</Note>
    </>,
    <>
      <Status tone="amber">Your landlord is getting quotes</Status>
      <Card>
        <p className="text-white text-sm font-medium">Kitchen sink leak</p>
        <p className="text-white/45 text-xs mt-0.5">Reported Mon 8:12 AM</p>
        <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full w-2/5 bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9]" /></div>
      </Card>
      <Note>No chasing. You see every step without asking &ldquo;any update?&rdquo;</Note>
    </>,
    <>
      <Card glow>
        <p className="text-white text-sm font-medium">Proposed visit</p>
        <p className="text-white/70 text-xs mt-1 flex items-center gap-1.5"><CalendarIcon className="w-3.5 h-3.5" /> Wed · 10 AM to 12 PM</p>
        <p className="text-white/45 text-[11px] mt-1">Ray&apos;s Plumbing</p>
        <div className="flex gap-2 mt-3"><Btn>Confirm</Btn><Btn ghost>Suggest another time</Btn></div>
      </Card>
      <Note>You pick what works for you. The contractor is told right away.</Note>
    </>,
    <>
      <Status tone="green"><CheckCircleIcon className="w-3 h-3" /> Repair finished</Status>
      <Card>
        <p className="text-white/80 text-xs">How did it go?</p>
        <div className="flex gap-1 mt-2 text-amber-300">{[0, 1, 2, 3, 4].map((i) => <StarIcon key={i} className="w-4 h-4 fill-current" />)}</div>
      </Card>
      <Note>Your rating is shown to other landlords picking a contractor.</Note>
    </>,
    <>
      <Status tone="muted">Closed</Status>
      <Card>
        <p className="text-white text-sm font-medium">Kitchen sink leak</p>
        <p className="text-white/45 text-xs mt-0.5">Fixed Wed · photos saved</p>
      </Card>
      <Note>Two days from report to fixed. Renters never pay Prophandld anything.</Note>
    </>,
  ],
  landlord: [
    <>
      <Card glow>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#12A5A9]">Today</p>
        <div className="flex items-center gap-2.5 mt-2">
          <span className="w-2 h-2 rounded-full bg-[#12A5A9] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-medium">New repair request: Plumbing</p>
            <p className="text-white/45 text-[11px] truncate">123 Oak St, Unit 2</p>
          </div>
          <Btn>Review</Btn>
        </div>
      </Card>
      <Card>
        <p className="text-white/80 text-xs">Maria&apos;s photo and description, plus the AI&apos;s note.</p>
        <div className="flex gap-2 mt-2.5"><Btn>Start bidding</Btn><Btn ghost>Use my own plumber</Btn></div>
      </Card>
      <Note>One tap to open bidding, or send it straight to someone you already trust.</Note>
    </>,
    <>
      <p className="text-white text-sm font-medium flex items-center gap-1.5"><Lock /> 3 sealed bids</p>
      {[
        { n: "Ray's Plumbing", p: '$185', r: '4.9', pick: true },
        { n: 'Northside Pipe Co.', p: '$240', r: '4.7' },
        { n: 'QuickFix Home', p: '$160', r: '4.1' },
      ].map((b) => (
        <div key={b.n} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${b.pick ? 'border-[#12A5A9]/40 bg-[#12A5A9]/8' : 'border-white/8 bg-white/3'}`}>
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-medium truncate">{b.n}</p>
            <p className="text-white/45 text-[11px]">★ {b.r} · licensed & insured</p>
          </div>
          <span className="text-white text-sm font-semibold tabular-nums">{b.p}</span>
        </div>
      ))}
      <Note>Contractors never see each other&apos;s price, so you get real numbers, not posturing.</Note>
    </>,
    <>
      <Status tone="teal"><CalendarIcon className="w-3 h-3" /> Visit confirmed</Status>
      <Card>
        <p className="text-white text-sm font-medium">Wed · 10 AM to 12 PM</p>
        <p className="text-white/45 text-xs mt-0.5">Ray&apos;s Plumbing · $185 · Maria confirmed</p>
      </Card>
      <Card>
        <p className="text-white/45 text-[11px] flex items-center gap-1.5 mb-1"><MessageCircleIcon className="w-3 h-3" /> Job chat</p>
        <p className="text-white/80 text-xs">Ray: &ldquo;I&apos;ll bring a new supply line just in case.&rdquo;</p>
      </Card>
      <Note>You didn&apos;t have to coordinate anyone. It&apos;s on your calendar.</Note>
    </>,
    <>
      <Card glow>
        <p className="text-white text-sm font-medium">Check finished work</p>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5"><Photo label="before" tone="before" /><Photo label="after" tone="after" /></div>
        <div className="flex gap-2 mt-3"><Btn>Approve &amp; pay $185</Btn></div>
      </Card>
      <Note>If you&apos;re busy, finished work is approved automatically after 3 days.</Note>
    </>,
    <>
      <Status tone="green"><ReceiptIcon className="w-3 h-3" /> Paid · receipt emailed</Status>
      <Card>
        <div className="flex items-center justify-between text-xs"><span className="text-white/60">Plumbing · 123 Oak St</span><span className="text-white font-semibold tabular-nums">$185.00</span></div>
        <div className="flex items-center justify-between text-[11px] mt-1.5"><span className="text-white/40">Records → Repairs</span><span className="text-white/40">tax-ready</span></div>
      </Card>
      <Note>Every dollar lands in Records by property, ready for your accountant.</Note>
    </>,
  ],
  contractor: [
    <>
      <div className="flex-1 grid place-items-center text-center px-2">
        <div>
          <span className="w-10 h-10 mx-auto rounded-full bg-white/5 text-white/30 grid place-items-center mb-3"><Lock /></span>
          <p className="text-white/60 text-sm font-medium">Nothing yet</p>
          <p className="text-white/40 text-xs mt-1 leading-relaxed">Contractors only hear about a job once the landlord opens it for bids.</p>
        </div>
      </div>
    </>,
    <>
      <Card glow>
        <p className="text-[11px] text-[#12A5A9] font-semibold">New job · 1.8 mi</p>
        <p className="text-white text-sm font-medium mt-0.5">Kitchen sink leak</p>
        <p className="text-white/45 text-[11px]">Plumbing · photos included</p>
        <div className="flex items-center gap-2 mt-3">
          <span className="flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-white text-sm tabular-nums">$185</span>
          <Btn>Send bid</Btn>
        </div>
      </Card>
      <Status tone="muted"><Lock /> Nobody else sees your price</Status>
      <Note>Free leads for your trade and area. No fee to bid, no cut of the job.</Note>
    </>,
    <>
      <Status tone="green"><CheckCircleIcon className="w-3 h-3" /> You got the job</Status>
      <Card>
        <p className="text-white text-sm font-medium">Wed · 10 AM to 12 PM</p>
        <p className="text-white/45 text-xs mt-0.5">123 Oak St, Unit 2 · tenant confirmed</p>
      </Card>
      <Note>Address, photos and the tenant&apos;s confirmed time, all in one place.</Note>
    </>,
    <>
      <Card>
        <p className="text-white text-sm font-medium">Mark complete</p>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5"><Photo label="before" tone="before" /><Photo label="after" tone="after" /></div>
      </Card>
      <Status tone="teal">Sent to the landlord for review</Status>
      <Note>Photos are your proof of the work if a question ever comes up.</Note>
    </>,
    <>
      <Status tone="green">$185.00 on the way to your bank</Status>
      <Card>
        <div className="flex items-center justify-between text-xs"><span className="text-white/60">Your bid</span><span className="text-white tabular-nums">$185.00</span></div>
        <div className="flex items-center justify-between text-xs mt-1"><span className="text-white/60">Prophandld fee</span><span className="text-white tabular-nums">$0.00</span></div>
      </Card>
      <Note>You keep the whole price you bid.</Note>
    </>,
  ],
}
