'use client'

import { StoryDemo, Status, Card, Btn, Note, Photo, Lock, type StoryStep, type StoryView } from '@/components/RepairStory'
import { BuildingIcon, UserIcon, WrenchIcon, CheckCircleIcon, ReceiptIcon, MessageCircleIcon } from '@/components/icons'

// "One approval, three views": the property-manager page's demo, built on the
// same engine as the homepage repair story. One quote that's over the
// owner's limit goes from the contractor's bid, through a one-tap owner
// approval, to payment and the owner's monthly statement. Canned sample data.

const STEPS: StoryStep[] = [
  { key: 'quote', label: 'Quote in', time: 'Mon 9:10 AM' },
  { key: 'ask', label: 'Owner asked', time: 'Mon 9:12 AM' },
  { key: 'approved', label: 'Approved', time: 'Mon 9:40 AM' },
  { key: 'done', label: 'Work done', time: 'Tue 11:05 AM' },
  { key: 'paid', label: 'Paid & reported', time: 'Tue 4:30 PM' },
]

const VIEWS: StoryView[] = [
  { key: 'pm', who: 'Property manager', name: 'Northline PM · Sam', icon: BuildingIcon },
  { key: 'owner', who: 'Owner', name: 'Dana · 41 Elm St', icon: UserIcon },
  { key: 'contractor', who: 'Contractor', name: "Ray's Plumbing", icon: WrenchIcon },
]

const SCREENS: Record<string, React.ReactNode[]> = {
  pm: [
    <>
      <Card glow>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#12A5A9]">Today · Dana&apos;s properties</p>
        <p className="text-white text-sm font-medium mt-2">Water heater replacement · $850</p>
        <p className="text-amber-300 text-xs mt-1">Over Dana&apos;s $500 approval limit</p>
        <div className="flex gap-2 mt-3"><Btn>Send for approval</Btn></div>
      </Card>
      <Note>Under the limit, you&apos;d just approve it. Over it, the app asks the owner for you.</Note>
    </>,
    <>
      <Status tone="amber">Waiting on Dana · sent 9:12 AM</Status>
      <Card>
        <p className="text-white/80 text-xs">The approval card includes the problem, photos, the contractor&apos;s rating and why it needs her OK.</p>
      </Card>
      <Note>No phone tag. If Dana has a question, she asks right on the card.</Note>
    </>,
    <>
      <Status tone="green"><CheckCircleIcon className="w-3 h-3" /> Dana approved the quote</Status>
      <Card>
        <p className="text-white text-sm font-medium">Ray&apos;s Plumbing hired</p>
        <p className="text-white/45 text-xs mt-0.5">Visit Tue 9–11 AM · tenant confirmed</p>
      </Card>
      <Note>Approved in 28 minutes, on the record with a timestamp.</Note>
    </>,
    <>
      <Card glow>
        <p className="text-white text-sm font-medium">Check finished work</p>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5"><Photo label="before" tone="before" /><Photo label="after" tone="after" /></div>
        <div className="flex gap-2 mt-3"><Btn>Approve &amp; pay $850</Btn></div>
      </Card>
      <Note>Dana already approved this price, so you can pay without asking again.</Note>
    </>,
    <>
      <Status tone="green"><ReceiptIcon className="w-3 h-3" /> Paid · receipt saved</Status>
      <Card>
        <div className="flex items-center justify-between text-xs"><span className="text-white/60">Dana · November statement</span><span className="text-white font-semibold tabular-nums">updated</span></div>
      </Card>
      <Note>Month-end is already done for this one. Nothing to re-type.</Note>
    </>,
  ],
  owner: [
    <>
      <div className="flex-1 grid place-items-center text-center px-2">
        <div>
          <span className="w-10 h-10 mx-auto rounded-full bg-white/5 text-white/30 grid place-items-center mb-3"><Lock /></span>
          <p className="text-white/60 text-sm font-medium">Nothing for Dana yet</p>
          <p className="text-white/40 text-xs mt-1 leading-relaxed">Owners only hear about what actually needs them.</p>
        </div>
      </div>
    </>,
    <>
      <Card glow>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Approve a repair quote</p>
        <p className="text-white text-sm font-medium mt-1.5">Water heater replacement</p>
        <p className="text-white text-xl font-bold tabular-nums">$850</p>
        <p className="text-amber-300 text-[11px]">Over your $500 approval limit</p>
        <div className="grid grid-cols-3 gap-1 mt-2"><Photo label="leak" tone="before" /></div>
        <p className="text-white/50 text-[11px] mt-2">Ray&apos;s Plumbing · ★ 4.8 (23 reviews)</p>
        <div className="flex flex-wrap gap-1.5 mt-3"><Btn>Approve quote</Btn><Btn ghost>Ask a question</Btn></div>
      </Card>
    </>,
    <>
      <Status tone="green"><CheckCircleIcon className="w-3 h-3" /> You approved · 9:40 AM</Status>
      <Card>
        <p className="text-white/45 text-[11px] flex items-center gap-1.5 mb-1"><MessageCircleIcon className="w-3 h-3" /> Northline PM</p>
        <p className="text-white/80 text-xs">&ldquo;Thanks Dana, Ray is booked for Tuesday morning.&rdquo;</p>
      </Card>
      <Note>One tap from her phone. No call, no email chain.</Note>
    </>,
    <>
      <Card>
        <p className="text-white text-sm font-medium">Water heater replaced</p>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5"><Photo label="before" tone="before" /><Photo label="after" tone="after" /></div>
      </Card>
      <Note>Owners see the same photos the manager approves.</Note>
    </>,
    <>
      <Card>
        <p className="text-white/45 text-[11px] mb-1.5">November statement</p>
        <div className="flex items-center justify-between text-xs"><span className="text-white/70">Rent collected</span><span className="text-white tabular-nums">$3,600.00</span></div>
        <div className="flex items-center justify-between text-xs mt-1"><span className="text-white/70">Water heater (receipt)</span><span className="text-white tabular-nums">−$850.00</span></div>
        <div className="flex items-center justify-between text-xs mt-1"><span className="text-white/70">Management fee</span><span className="text-white tabular-nums">−$288.00</span></div>
      </Card>
      <Note>Every line links to its receipt. Rent went straight to Dana.</Note>
    </>,
  ],
  contractor: [
    <>
      <Status tone="teal">Bid sent · $850</Status>
      <Card>
        <p className="text-white text-sm font-medium">Water heater replacement</p>
        <p className="text-white/45 text-xs mt-0.5">41 Elm St · 2.4 mi</p>
      </Card>
      <Status tone="muted"><Lock /> Nobody else sees your price</Status>
    </>,
    <>
      <Status tone="muted">Waiting to hear back</Status>
      <Note>Contractors aren&apos;t pulled into the owner conversation.</Note>
    </>,
    <>
      <Status tone="green"><CheckCircleIcon className="w-3 h-3" /> You got the job</Status>
      <Card>
        <p className="text-white text-sm font-medium">Tue · 9–11 AM</p>
        <p className="text-white/45 text-xs mt-0.5">41 Elm St · tenant confirmed</p>
      </Card>
    </>,
    <>
      <Card>
        <p className="text-white text-sm font-medium">Mark complete</p>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5"><Photo label="before" tone="before" /><Photo label="after" tone="after" /></div>
      </Card>
      <Status tone="teal">Sent for review</Status>
    </>,
    <>
      <Status tone="green">$850.00 on the way to your bank</Status>
      <Card>
        <div className="flex items-center justify-between text-xs"><span className="text-white/60">Prophandld fee</span><span className="text-white tabular-nums">$0.00</span></div>
      </Card>
      <Note>Paid the same day the work was approved.</Note>
    </>,
  ],
}

export function ApprovalStory() {
  return <StoryDemo steps={STEPS} views={VIEWS} screens={SCREENS} defaultView="owner" label="Sample approval · not real people" />
}
