'use client'

import { BellIcon } from '@/components/icons'

// The same six-stage progress bar the job emails use, so the landing page
// shows people what they will actually see in their inbox.
const STEPS = [
  { label: 'Report', title: 'Report the issue', body: 'A renter flags a problem with photos, so nobody has to decode "it’s making a noise". Or you start a job yourself.' },
  { label: 'Bids', title: 'Compare sealed bids', body: 'Nearby contractors are alerted and bid privately. You pick on trust and value, not just price.' },
  { label: 'Schedule', title: 'Agree a time', body: 'Propose a time, confirm it, and it lands on everyone’s calendar.' },
  { label: 'Work', title: 'The work gets done', body: 'Need to change the price? You see the labor and parts breakdown and approve it first.' },
  { label: 'Approve', title: 'Photos, approval, receipt', body: 'After photos are required. You approve, pay in the app, and both sides get a receipt.' },
]

export function HowItWorksTracker() {
  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5 mb-10" aria-hidden>
        {STEPS.map((s) => (
          <div key={s.label}>
            <div className="h-1 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9]" />
            <p className="text-[11px] text-[#7FD4D6] font-medium mt-2 hidden sm:block">{s.label}</p>
          </div>
        ))}
      </div>
      <ol className="grid sm:grid-cols-5 gap-8 sm:gap-5">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-bold flex items-center justify-center mb-4">{i + 1}</div>
            <h3 className="text-white font-semibold mb-1.5">{s.title}</h3>
            <p className="text-white/50 text-sm leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

const TRACKER = ['Reported', 'Bidding', 'Scheduled', 'In progress', 'Review', 'Closed']

function PushBanner({ title, body, time }: { title: string; body: string; time: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3.5 flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/apple-touch-icon.png" alt="" width={38} height={38} className="w-[38px] h-[38px] rounded-[10px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-[11px] text-white/50 uppercase tracking-wide">
          <span>Prophandld</span>
          <span>{time}</span>
        </div>
        <p className="text-white font-semibold text-sm leading-snug mt-0.5">{title}</p>
        <p className="text-white/60 text-[13px] leading-snug">{body}</p>
      </div>
    </div>
  )
}

export function NotificationPreview() {
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      {/* Phone alerts */}
      <div className="rounded-3xl border border-white/10 bg-[#0F2138] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[#12A5A9] text-xs font-semibold uppercase tracking-wide mb-4">
          <BellIcon className="w-4 h-4" /> On your phone
        </div>
        <div className="space-y-3">
          <PushBanner title="New bid: $45 for Plumbing" body="Jordan L. · 123 Maple St, Philadelphia" time="now" />
          <PushBanner title="Confirmed: Tue, Sep 22 · Morning" body="Plumbing · 123 Maple St, Philadelphia" time="2m ago" />
          <PushBanner title="Jordan L. finished the Plumbing work" body="Review and approve. It auto-approves in 3 days." time="1h ago" />
        </div>
        <p className="text-white/40 text-xs mt-4">Example alerts. Add Prophandld to your Home Screen to get them, and retire the "any update?" texts.</p>
      </div>

      {/* Email */}
      <div className="rounded-3xl border border-white/10 bg-[#0C1A2E] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[#12A5A9] text-xs font-semibold uppercase tracking-wide mb-4">
          <BellIcon className="w-4 h-4" /> In your inbox
        </div>
        <div className="rounded-[22px] bg-[#0F2138] border border-[#1B2F48] p-5 sm:p-6">
          <span className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3">Your review needed</span>
          <p className="text-white font-bold text-lg leading-snug mb-1">The work is finished</p>
          <p className="text-[#A9B7C8] text-sm leading-relaxed mb-4">
            <strong className="text-white">Jordan Lee</strong> marked the <strong className="text-white">Plumbing</strong> job as complete. Check the before and after photos, then approve.
          </p>
          <div className="grid grid-cols-6 gap-1 mb-4" aria-hidden>
            {TRACKER.map((label, i) => (
              <div key={label}>
                <div className={`h-1 rounded-full ${i < 4 ? 'bg-[#0A7B7E]' : i === 4 ? 'bg-[#2DD4D9]' : 'bg-[#22374F]'}`} />
                {/* Six labels in six narrow columns wrap into each other below
                    about 420px, so they're hidden at the very narrowest widths;
                    the bar colors alone still show which step is active. */}
                <p className={`hidden min-[420px]:block text-[9px] mt-1.5 leading-tight ${i === 4 ? 'text-white font-bold' : i < 4 ? 'text-[#7FD4D6]' : 'text-[#5E7189]'}`}>{label}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-[#132A45] px-4 py-1 mb-4 text-sm">
            {[
              ['Contractor', 'Jordan Lee'],
              ['Price', '$45'],
              ['Where', '123 Maple St, Philadelphia'],
            ].map(([k, v], i) => (
              <div key={k} className={`flex justify-between gap-3 py-2 ${i > 0 ? 'border-t border-[#1E3450]' : ''}`}>
                <span className="text-[#8496AC] text-xs">{k}</span>
                <span className="text-white font-semibold text-right">{v}</span>
              </div>
            ))}
          </div>
          <span className="inline-block bg-gradient-to-r from-[#0A7B7E] to-[#12A5A9] text-white text-sm font-semibold px-5 py-2.5 rounded-full">Review and approve →</span>
        </div>
        <p className="text-white/40 text-xs mt-4">An example email. Every step of a job gets one, with what changed and what to do next.</p>
      </div>
    </div>
  )
}
