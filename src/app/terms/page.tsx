import Link from 'next/link'
import { Logo } from '@/components/Logo'

export const metadata = {
  title: 'Terms of Service | Prophandld',
}

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-white/40 text-sm mb-12">Last updated September 14, 2026</p>

        <div className="space-y-10 text-white/60 text-sm leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">

          <section>
            <h2>1. What Prophandld is</h2>
            <p>
              Prophandld is a platform that connects landlords, renters, and contractors to manage
              rental properties and coordinate maintenance work. Landlords track properties, units,
              and tenants; renters report maintenance issues; contractors submit sealed bids on jobs
              and get selected by landlords. By creating an account, you agree to these terms.
            </p>
          </section>

          <section>
            <h2>2. Accounts and roles</h2>
            <p>
              You choose a role when you sign up — landlord, renter, or contractor — and the
              information you can see and the actions you can take depend on that role. You're
              responsible for keeping your login credentials secure and for the accuracy of the
              information you provide, including your contact details and (for contractors) license
              and insurance information.
            </p>
          </section>

          <section>
            <h2>3. Sealed bidding</h2>
            <p>
              When a maintenance job goes out to bid, contractors submit their price privately —
              they can't see what anyone else has bid. Landlords choose who to select. Prophandld
              doesn't set prices, doesn't guarantee any particular outcome from bidding, and isn't a
              party to the agreement between a landlord and the contractor they select.
            </p>
          </section>

          <section>
            <h2>4. Contractor verification</h2>
            <p>
              Contractors may submit license and insurance information for review. A "Verified" badge
              means Prophandld has reviewed the documents a contractor submitted — it is not a
              guarantee of a contractor's work quality, licensing status at any given moment, or
              insurance coverage for a specific job. Landlords are responsible for their own diligence
              before hiring.
            </p>
          </section>

          <section>
            <h2>5. No payment processing (for now)</h2>
            <p>
              Prophandld does not currently process rent payments or contractor payments. Any money
              that changes hands between landlords, renters, and contractors happens outside the
              platform, entirely between those parties. If and when in-app payments launch, these
              terms will be updated and you'll be notified.
            </p>
          </section>

          <section>
            <h2>6. Content you upload</h2>
            <p>
              You may upload photos, documents, and other content (job photos, lease documents,
              inspection reports, license/insurance files). You keep ownership of what you upload,
              but you grant Prophandld the right to store and display it to the people it's meant
              for — for example, before/after job photos are visible to the landlord, renter, and
              contractor involved in that job.
            </p>
            <p>
              Don't upload anything you don't have the right to share, and don't upload anything
              illegal, harassing, or knowingly false.
            </p>
          </section>

          <section>
            <h2>7. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Misrepresent your identity, role, or qualifications (especially licensing/insurance as a contractor)</li>
              <li>Use the platform to harass, discriminate against, or defraud another user</li>
              <li>Attempt to circumvent sealed bidding by coordinating prices with other contractors</li>
              <li>Scrape, reverse-engineer, or interfere with the platform's normal operation</li>
            </ul>
          </section>

          <section>
            <h2>8. Disclaimers</h2>
            <p>
              Prophandld is provided "as is." We do our best to keep it running and accurate, but we
              don't guarantee it will be uninterrupted, error-free, or that it will meet your specific
              needs. Prophandld is not responsible for the quality of maintenance work performed,
              disputes between landlords/renters/contractors, or losses arising from your use of the
              platform, to the fullest extent permitted by law.
            </p>
          </section>

          <section>
            <h2>9. Termination</h2>
            <p>
              You can stop using Prophandld and delete your account at any time. We may suspend or
              terminate accounts that violate these terms or that we reasonably believe are being
              used fraudulently or abusively.
            </p>
          </section>

          <section>
            <h2>10. Changes to these terms</h2>
            <p>
              We may update these terms as the platform evolves — for example, when new features like
              in-app rent payments launch. We'll update the date at the top of this page when we do.
              Continuing to use Prophandld after a change means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2>11. Governing law</h2>
            <p>
              These terms are governed by the laws of the Commonwealth of Pennsylvania, without
              regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2>12. Contact</h2>
            <p>
              Questions about these terms? Reach out at{' '}
              <a href="mailto:support@prophandld.com" className="text-[#12A5A9] hover:underline">support@prophandld.com</a>.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between text-sm text-white/40">
          <span>© 2026 Prophandld</span>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  )
}
