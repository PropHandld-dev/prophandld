import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BackHomeLink } from '@/components/BackHomeLink'

export const metadata = {
  title: 'SMS Consent | Prophandld',
  description: 'How Prophandld users opt in to text message alerts.',
}

export default function SmsConsentPage() {
  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <BackHomeLink className="text-sm text-white/50 hover:text-white transition" />
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">SMS Consent</h1>
        <p className="text-white/60 text-sm mb-10">How Prophandld LLC users opt in to text message alerts.</p>

        <div className="space-y-8 text-white/70 text-sm leading-relaxed">
          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Account signup never requires SMS consent</h2>
            <p>
              Creating a Prophandld account only collects a name, email address, and phone number.
              There is no SMS checkbox anywhere in account signup, and signup completes fully whether
              or not a user ever opts in to text messages.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Opting in is a separate, optional step</h2>
            <p>
              After creating an account, a signed-in user can turn on text alerts from the
              Notifications section of their account settings (Profile → Notifications → &quot;Text
              alerts&quot;). This control is off by default. The same screen shows the phone number
              texts will be sent to, directly beside the toggle, so it&apos;s clear which number is being
              given permission to receive texts:
            </p>
            <blockquote className="border-l-2 border-[#12A5A9]/50 pl-4 my-4 text-white/80">
              Text alerts — Key moments only: a new issue reported, a new job to bid on, scheduling,
              review needed. Message &amp; data rates may apply. Reply STOP to opt out, HELP for help.
              <br />
              Texts go to [the account&apos;s phone number]
            </blockquote>
            <p>
              A user can turn text alerts off again at any time from the same screen. Opting in or out
              has no effect on account access or any other part of the service.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">What this looks like</h2>
            <p className="mb-4">
              The screenshots below are taken directly from a live Prophandld account&apos;s Notifications
              settings — the toggle off (not yet opted in) and on (opted in), with the phone number and
              full disclosure visible in both.
            </p>
            <div className="space-y-6">
              <figure>
                <img
                  src="/compliance/sms-optin-before.png"
                  alt="Prophandld Notifications settings showing the Text alerts toggle switched off, with its disclosure text and the phone number texts would go to"
                  className="rounded-xl border border-white/10 w-full"
                />
                <figcaption className="text-white/50 text-xs mt-2">Before opting in — toggle off, default state</figcaption>
              </figure>
              <figure>
                <img
                  src="/compliance/sms-optin-after.png"
                  alt="Prophandld Notifications settings showing the Text alerts toggle switched on, confirming SMS opt-in for the account's phone number"
                  className="rounded-xl border border-white/10 w-full"
                />
                <figcaption className="text-white/50 text-xs mt-2">After opting in — toggle on, consent given</figcaption>
              </figure>
            </div>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Message types and opt-out</h2>
            <p>
              Opted-in users receive text alerts only for key job and scheduling updates: a new
              maintenance job opening near a contractor, a new issue reported by a tenant, a proposed
              or confirmed appointment time, and a completed job ready for a landlord&apos;s review.
              These are account notifications, not marketing messages. Reply STOP to a Prophandld text
              at any time to opt out, or HELP for help. Message and data rates may apply. This SMS
              program is operated by Prophandld LLC.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-2xl mx-auto px-6 flex items-center justify-between text-sm text-white/60">
          <span>© 2026 Prophandld LLC</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-white transition">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
