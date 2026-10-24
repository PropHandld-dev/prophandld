import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BackHomeLink } from '@/components/BackHomeLink'

export const metadata = {
  title: 'Phone Verification SMS | Prophandld',
  description: 'How Prophandld sends one-time phone verification codes by SMS.',
}

export default function PhoneVerificationConsentPage() {
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
        <h1 className="text-3xl font-bold mb-2">Phone Number Verification</h1>
        <p className="text-white/60 text-sm mb-10">How Prophandld LLC sends one-time phone verification codes by SMS.</p>

        <div className="space-y-8 text-white/70 text-sm leading-relaxed">
          <section>
            <h2 className="text-white font-semibold text-lg mb-2">What this message is</h2>
            <p>
              Prophandld sends a one-time 6-digit verification code by SMS to confirm a user&apos;s
              phone number before they can enable text alerts on their account, or after they change
              their saved phone number. The code is requested directly by the account holder — by
              tapping &quot;Verify phone number&quot; in the app — and is never sent unprompted. Each
              code expires after 10 minutes.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">What this looks like</h2>
            <p className="mb-4">
              This screenshot is taken directly from a live Prophandld account&apos;s Profile page,
              showing the disclosure a user sees immediately before a verification code is sent.
            </p>
            <figure>
              <img
                src="/compliance/phone-verification-consent.png"
                alt="Prophandld profile page showing the Text alerts toggle and the Verify your phone number panel with the message: We sent a 6-digit code to the user's phone. Enter it to turn on text alerts. Msg and data rates may apply."
                className="rounded-xl border border-white/10 w-full"
              />
              <figcaption className="text-white/50 text-xs mt-2">
                Verification panel shown after requesting a code — phone number, disclosure text, and
                code entry all visible together
              </figcaption>
            </figure>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Message content and opt-out</h2>
            <p>
              This flow sends exactly one message per request: the verification code itself. No
              marketing or recurring account-notification content is sent as part of phone
              verification. Message and data rates may apply. This SMS program is operated by
              Prophandld LLC. For Prophandld&apos;s separate, optional text-alerts program (job and
              scheduling updates), see our <Link href="/sms-consent" className="text-[#12A5A9] hover:underline">SMS Consent</Link> page.
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
