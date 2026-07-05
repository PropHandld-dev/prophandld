'use client'

import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#0C1A2E]">

      {/* Nav */}
      <nav className="border-b border-black/5 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#FAF8F4]/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2.5">
          <svg width="30" height="30" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,5 38,16 38,28 62,28 62,16" fill="#0C1A2E" opacity="0.95"/>
            <rect x="44" y="18" width="12" height="10" rx="0.5" fill="#FAF8F4"/>
            <line x1="38" y1="20" x2="18" y2="42" stroke="#0C1A2E" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="62" y1="20" x2="82" y2="42" stroke="#0C1A2E" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="13" cy="48" r="11" fill="#0C1A2E"/>
            <text x="13" y="53" textAnchor="middle" fill="#FAF8F4" fontSize="11" fontFamily="Inter,sans-serif" fontWeight="800">$</text>
            <circle cx="84" cy="46" r="9" fill="none" stroke="#0C1A2E" strokeWidth="3"/>
            <circle cx="83.5" cy="45.5" r="5" fill="none" stroke="#0C1A2E" strokeWidth="2.5"/>
            <line x1="87" y1="49.5" x2="92" y2="55" stroke="#0C1A2E" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="50" cy="44" r="8" fill="#0C1A2E"/>
            <path d="M34 56 Q42 51 50 51 Q58 51 66 56 L68 78 H32 Z" fill="#0C1A2E"/>
            <polygon points="50,53 48,60 50,62 52,60" fill="#12A5A9"/>
            <path d="M36 59 Q26 54 20 50" stroke="#0C1A2E" strokeWidth="4" strokeLinecap="round" fill="none"/>
            <path d="M64 59 Q74 54 80 50" stroke="#0C1A2E" strokeWidth="4" strokeLinecap="round" fill="none"/>
            <rect x="38" y="78" width="9" height="18" rx="4" fill="#0C1A2E"/>
            <rect x="53" y="78" width="9" height="18" rx="4" fill="#0C1A2E"/>
          </svg>
          <span className="font-bold text-lg tracking-tight">Prophandld</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#how-it-works" className="text-sm text-[#0C1A2E]/60 hover:text-[#0C1A2E] transition hidden sm:block">How it works</a>
          <a href="#roles" className="text-sm text-[#0C1A2E]/60 hover:text-[#0C1A2E] transition hidden sm:block">Who it's for</a>
          <Link href="/login" className="text-sm font-medium text-[#0C1A2E]/70 hover:text-[#0C1A2E] transition">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="bg-[#0A7B7E] text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-[#0A7B7E]/90 transition"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-[#12A5A9]/10 text-[#0A7B7E] text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
          Now onboarding beta landlords in Philadelphia
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Property maintenance,<br />without the runaround.
        </h1>
        <p className="text-lg text-[#0C1A2E]/60 max-w-2xl mx-auto mb-10">
          Prophandld connects landlords, renters, and contractors in one place —
          with sealed bidding so you get honest prices, and escrow so nobody pays
          until the job's actually done.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="bg-[#0A7B7E] text-white font-semibold px-7 py-3.5 rounded-full hover:bg-[#0A7B7E]/90 transition"
          >
            Get started free
          </Link>
          <Link
            href="/login"
            className="text-[#0C1A2E] font-semibold px-7 py-3.5 rounded-full border border-[#0C1A2E]/15 hover:border-[#0C1A2E]/30 transition"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-7 border border-black/5">
            <div className="text-3xl mb-4">🔒</div>
            <h3 className="font-bold text-lg mb-2">Sealed bidding</h3>
            <p className="text-[#0C1A2E]/60 text-sm leading-relaxed">
              Contractors bid without seeing each other's prices. You get real
              competition, not inflated quotes.
            </p>
          </div>
          <div className="bg-white rounded-2xl p-7 border border-black/5">
            <div className="text-3xl mb-4">🛡️</div>
            <h3 className="font-bold text-lg mb-2">Escrow protection</h3>
            <p className="text-[#0C1A2E]/60 text-sm leading-relaxed">
              Payment is held safely until the job is confirmed complete.
              No surprises, no chasing refunds.
            </p>
          </div>
          <div className="bg-white rounded-2xl p-7 border border-black/5">
            <div className="text-3xl mb-4">✅</div>
            <h3 className="font-bold text-lg mb-2">Verified contractors</h3>
            <p className="text-[#0C1A2E]/60 text-sm leading-relaxed">
              Every contractor on the network is vetted, so you're not
              gambling on who shows up.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-white py-20 border-y border-black/5">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-10">
            <div>
              <div className="w-10 h-10 rounded-full bg-[#0A7B7E] text-white font-bold flex items-center justify-center mb-4">1</div>
              <h3 className="font-semibold text-lg mb-2">Report the issue</h3>
              <p className="text-[#0C1A2E]/60 text-sm leading-relaxed">
                A renter flags a problem, or a landlord starts a job directly.
                Photos and details included.
              </p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-full bg-[#0A7B7E] text-white font-bold flex items-center justify-center mb-4">2</div>
              <h3 className="font-semibold text-lg mb-2">Compare sealed bids</h3>
              <p className="text-[#0C1A2E]/60 text-sm leading-relaxed">
                Verified contractors submit private bids. The landlord picks
                the best one — no bias, no bidding wars.
              </p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-full bg-[#0A7B7E] text-white font-bold flex items-center justify-center mb-4">3</div>
              <h3 className="font-semibold text-lg mb-2">Job done, paid safely</h3>
              <p className="text-[#0C1A2E]/60 text-sm leading-relaxed">
                Funds sit in escrow until the work is confirmed. Then the
                contractor gets paid — automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* For each role */}
      <section id="roles" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Built for everyone in the loop</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="rounded-2xl p-7 border border-black/5">
            <span className="text-xs font-semibold text-[#0A7B7E] bg-[#12A5A9]/10 px-3 py-1 rounded-full">Landlords</span>
            <h3 className="font-bold text-lg mt-4 mb-2">Stop chasing quotes</h3>
            <p className="text-[#0C1A2E]/60 text-sm leading-relaxed mb-5">
              Manage every property, unit, and tenant in one dashboard. Get
              honest bids and never wonder if you overpaid.
            </p>
            <Link href="/signup" className="text-[#0A7B7E] text-sm font-semibold hover:underline">
              Sign up as a landlord →
            </Link>
          </div>
          <div className="rounded-2xl p-7 border border-black/5">
            <span className="text-xs font-semibold text-[#0A7B7E] bg-[#12A5A9]/10 px-3 py-1 rounded-full">Renters</span>
            <h3 className="font-bold text-lg mt-4 mb-2">Get things fixed, fast</h3>
            <p className="text-[#0C1A2E]/60 text-sm leading-relaxed mb-5">
              Report an issue in seconds. See emergency contacts for your
              unit in one tap, no digging through old texts.
            </p>
            <Link href="/signup" className="text-[#0A7B7E] text-sm font-semibold hover:underline">
              Sign up as a renter →
            </Link>
          </div>
          <div className="rounded-2xl p-7 border border-black/5">
            <span className="text-xs font-semibold text-[#0A7B7E] bg-[#12A5A9]/10 px-3 py-1 rounded-full">Contractors</span>
            <h3 className="font-bold text-lg mt-4 mb-2">Bid fair, get paid</h3>
            <p className="text-[#0C1A2E]/60 text-sm leading-relaxed mb-5">
              See real jobs near you, submit a sealed bid, and know your
              payment is already secured before you start.
            </p>
            <Link href="/signup" className="text-[#0A7B7E] text-sm font-semibold hover:underline">
              Sign up as a contractor →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ placeholder */}
      <section className="bg-white py-20 border-y border-black/5">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Common questions</h2>
          <div className="space-y-4">
            {[
              { q: 'How does sealed bidding actually work?', a: 'Contractors submit their price privately — they never see what anyone else bid. This keeps quotes honest instead of inflated by guesswork.' },
              { q: 'When does the contractor get paid?', a: 'Funds are held in escrow as soon as a bid is accepted, and released automatically once the job is confirmed complete and the dispute window has passed.' },
              { q: 'Is Prophandld available in my area?', a: "We're currently onboarding beta landlords in the Philadelphia area, with more markets opening soon." },
            ].map((item) => (
              <div key={item.q} className="border border-black/5 rounded-xl p-5">
                <h3 className="font-semibold mb-1.5">{item.q}</h3>
                <p className="text-[#0C1A2E]/60 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
        <p className="text-[#0C1A2E]/60 mb-8">It takes about two minutes to set up your first property.</p>
        <Link
          href="/signup"
          className="bg-[#0A7B7E] text-white font-semibold px-8 py-4 rounded-full hover:bg-[#0A7B7E]/90 transition inline-block"
        >
          Create your free account
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 py-8">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-sm text-[#0C1A2E]/40">
          <span>© 2026 Prophandld</span>
          <div className="flex gap-6">
            <Link href="/login" className="hover:text-[#0C1A2E] transition">Sign in</Link>
            <Link href="/signup" className="hover:text-[#0C1A2E] transition">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}