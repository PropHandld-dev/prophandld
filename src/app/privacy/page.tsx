import Link from 'next/link'
import { Logo } from '@/components/Logo'

export const metadata = {
  title: 'Privacy Policy | Prophandld',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </Link>
        <Link href="/" className="text-sm text-white/50 hover:text-white transition">← Back home</Link>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-white/60 text-sm mb-12">Last updated September 14, 2026</p>

        <div className="space-y-10 text-white/60 text-sm leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">

          <section>
            <h2>1. What we collect</h2>
            <p>To run the platform, we collect:</p>
            <ul>
              <li><strong className="text-white/80">Account info:</strong> name, email, phone number, role (landlord/renter/contractor), preferred language</li>
              <li><strong className="text-white/80">Property data:</strong> addresses, unit details, tenancy terms, rent amounts, entered by landlords</li>
              <li><strong className="text-white/80">Job data:</strong> maintenance descriptions, categories, bids, photos, and documents you upload</li>
              <li><strong className="text-white/80">Contractor verification:</strong> license numbers, license/insurance documents, if you submit them for review</li>
              <li><strong className="text-white/80">Usage data:</strong> pages visited and actions taken, collected automatically to understand how the product is used</li>
              <li><strong className="text-white/80">Location:</strong> a property's address is geocoded to approximate coordinates, used to match jobs with nearby contractors by service area</li>
            </ul>
          </section>

          <section>
            <h2>2. How we use it</h2>
            <p>
              We use your data to run the core functions of the platform: matching jobs to
              contractors in range, notifying the right people when something happens (a new issue,
              a bid, a schedule confirmation), showing landlords and renters what's relevant to their
              own properties and units, and improving the product based on how it's actually used.
              We don't sell your personal data.
            </p>
          </section>

          <section>
            <h2>3. Who we share it with</h2>
            <p>
              We use a small number of service providers to run Prophandld, and your data passes
              through them as part of normal operation:
            </p>
            <ul>
              <li><strong className="text-white/80">Supabase:</strong> our database, authentication, and file storage provider. Nearly everything you enter is stored here.</li>
              <li><strong className="text-white/80">Resend:</strong> sends transactional emails (job notifications, invites, password resets) on our behalf.</li>
              <li><strong className="text-white/80">PostHog:</strong> product analytics, so we can see which features are actually being used.</li>
              <li><strong className="text-white/80">Sentry:</strong> error tracking, so we know when something breaks.</li>
              <li><strong className="text-white/80">Vercel:</strong> hosts the application itself.</li>
            </ul>
            <p>
              Within the platform, your data is also visible to other users where it needs to be.
              For example, a landlord sees their renters' reported issues and contact info; a
              contractor with an accepted bid sees the property address and unit for that job.
              Tenant-facing views are deliberately limited. For instance, renters never see bid
              amounts or other contractors' information during sealed bidding.
            </p>
          </section>

          <section>
            <h2>4. Data retention & deletion</h2>
            <p>
              We keep your data for as long as your account is active. If you delete your account,
              or ask us to, we'll remove your personal information within a reasonable time, except
              where we need to retain something for legal or legitimate business reasons (for
              example, records tied to an active or recent maintenance job).
            </p>
          </section>

          <section>
            <h2>5. Your rights</h2>
            <p>
              You can access, correct, or request deletion of your personal data at any time by
              emailing us. If you're in a jurisdiction with specific data protection rights (like
              GDPR or CCPA), we'll honor requests consistent with those laws.
            </p>
          </section>

          <section>
            <h2>6. Cookies & tracking</h2>
            <p>
              We use cookies and similar technology to keep you signed in and to understand product
              usage through PostHog. We don't use tracking for third-party advertising.
            </p>
          </section>

          <section>
            <h2>7. Children's privacy</h2>
            <p>
              Prophandld is not intended for anyone under 18. We don't knowingly collect data from
              children.
            </p>
          </section>

          <section>
            <h2>8. Changes to this policy</h2>
            <p>
              We'll update the date at the top of this page whenever this policy changes, and for
              significant changes, we'll make a reasonable effort to let you know directly.
            </p>
          </section>

          <section>
            <h2>9. Contact</h2>
            <p>
              Questions about your data? Reach out at{' '}
              <a href="mailto:admin@prophandld.com" className="text-[#12A5A9] hover:underline">admin@prophandld.com</a>.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between text-sm text-white/60">
          <span>© 2026 Prophandld</span>
          <Link href="/terms" className="hover:text-white transition">Terms of Service</Link>
        </div>
      </footer>
    </div>
  )
}
