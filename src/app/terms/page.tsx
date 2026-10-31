import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { BrandLink } from '@/components/BrandLink'
import { BackHomeLink } from '@/components/BackHomeLink'

export const metadata = {
  title: 'Terms of Service | Prophandld',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0C1A2E] text-white">
      <nav className="border-b border-white/8 px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between sticky top-0 bg-[#0C1A2E]/90 backdrop-blur-sm z-10">
        <BrandLink className="gap-2.5">
          <Logo className="w-[26px] h-[26px]" />
          <span className="font-bold tracking-tight">Prophandld</span>
        </BrandLink>
        <BackHomeLink className="text-sm text-white/50 hover:text-white transition" />
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-white/60 text-sm mb-12">Last updated October 31, 2026</p>

        <div className="space-y-10 text-white/60 text-sm leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">

          <section>
            <div className="bg-[#12A5A9]/8 border border-[#12A5A9]/20 rounded-xl px-4 py-3 mb-2">
              <p className="text-white/80 text-sm mb-0">
                Looking for the detailed terms for your specific role? See{' '}
                <Link href="/terms/landlord" className="text-[#12A5A9] hover:underline">Landlord Terms</Link>,{' '}
                <Link href="/terms/renter" className="text-[#12A5A9] hover:underline">Renter Terms</Link>, or{' '}
                <Link href="/terms/contractor" className="text-[#12A5A9] hover:underline">Contractor Terms</Link>.
                This page is the general agreement that applies to everyone.
              </p>
            </div>
          </section>

          <section>
            <h2>1. What Prophandld is</h2>
            <p>
              Prophandld is a platform that connects landlords, renters, and contractors to manage
              rental properties and coordinate maintenance work. Landlords track properties, units,
              and tenants; renters report maintenance issues; contractors submit sealed bids on jobs
              and get selected by landlords. By creating an account, you agree to these terms.
            </p>
            <p>
              Prophandld is operated by Prophandld LLC, a Pennsylvania limited liability company.
            </p>
          </section>

          <section>
            <h2>2. Accounts and roles</h2>
            <p>
              You must be at least 18 years old to create a Prophandld account.
            </p>
            <p>
              You choose a role when you sign up (landlord, renter, or contractor), and the
              information you can see and the actions you can take depend on that role. You're
              responsible for keeping your login credentials secure and for the accuracy of the
              information you provide, including your contact details and (for contractors) license
              and insurance information.
            </p>
            <p>
              You're responsible for all activity on your account, authorized or not, until you
              report it to us. If you suspect someone else has accessed your account, change your
              password immediately and contact{' '}
              <a href="mailto:admin@prophandld.com" className="text-[#12A5A9] hover:underline">admin@prophandld.com</a>{' '}
              right away. We may ask you to verify your identity before restoring access. We aren't
              responsible for losses that happen before you report a compromise to us.
            </p>
            <p>
              If you genuinely act in more than one role (for example, you're a landlord who also
              does contracting work), you can link a second role profile to the same identity and
              switch between them. You're responsible for how every profile linked to you is used.
              Using linked profiles to bid on, select, or review your own jobs, or otherwise gain an
              advantage no other user could have, isn't allowed, whether or not our systems happen
              to block a specific attempt.
            </p>
            <p>
              A landlord can also invite a co-owner (a separate person, such as a business partner
              or property manager, with their own login) to manage their properties alongside them.
              A co-owner gets the same access to your properties, units, tenants, jobs, rent, and
              compliance tracking that you have; they can't see or change your subscription billing,
              and can't permanently delete a property. You're responsible for who you invite and for
              their use of that access, and you can remove a co-owner's access at any time from your
              profile.
            </p>
          </section>

          <section>
            <h2>3. Landlord responsibilities</h2>
            <p>As a landlord, you agree to:</p>
            <ul>
              <li>Provide accurate information about your properties, units, and lease terms: address, rent amount, unit count, and who actually lives there</li>
              <li>Keep required licenses, certifications, and inspections (for example, a rental license or lead certification where your jurisdiction requires one) current, and use the platform's compliance tracking as a tool, not a substitute for knowing your own legal obligations</li>
              <li>Respond to reported maintenance issues in a reasonable time, and not use the platform to avoid habitability or repair obligations you have under applicable law</li>
              <li>Pay contractors the full amount you approve for completed work, and pay your own Prophandld subscription fee on time</li>
              <li>Respect a renter's privacy: only use their contact information and personal data for managing the tenancy, never for an unrelated purpose</li>
              <li>Take responsibility for any co-owner you invite to help manage your properties, including their use of that access (see Section 2)</li>
            </ul>
          </section>

          <section>
            <h2>4. Renter responsibilities</h2>
            <p>As a renter, you agree to:</p>
            <ul>
              <li>Report maintenance issues honestly and provide a reasonably accurate description, including marking something an emergency only when it actually is one</li>
              <li>Provide reasonable access for a scheduled contractor visit or inspection, or communicate promptly if a scheduled time no longer works</li>
              <li>Pay rent on time through the method you and your landlord have set up, and not use the platform to misrepresent whether a payment was made</li>
              <li>Keep any co-renter or backup contact information you provide accurate, and take responsibility for a co-renter you add to your unit</li>
              <li>Not use any contact information you gain through a job (for example, a contractor's) for anything outside that job</li>
            </ul>
          </section>

          <section>
            <h2>5. Contractor responsibilities</h2>
            <p>As a contractor, you agree to:</p>
            <ul>
              <li>Submit accurate, current license and insurance information, and tell us promptly if either lapses or changes</li>
              <li>Perform work you bid on professionally, safely, and to the applicable code for your trade. A "Verified" badge reflects document review, not a guarantee of your work (see Section 7)</li>
              <li>Honor a sealed bid you submit, and not withdraw from or materially change a job's scope after a landlord selects you except through the platform's price-change process</li>
              <li>Never attempt to see, infer, or coordinate on another contractor's bid, and never ask a landlord or renter what a competing bid was</li>
              <li>Not solicit a landlord or renter to pay you directly, off-platform, for a job that started on Prophandld, in a way meant to avoid the platform's payment and dispute protections</li>
            </ul>
          </section>

          <section>
            <h2>6. Sealed bidding</h2>
            <p>
              When a maintenance job goes out to bid, contractors submit their price privately.
              They can't see what anyone else has bid. Landlords choose who to select. Prophandld
              doesn't set prices, doesn't guarantee any particular outcome from bidding, and isn't a
              party to the agreement between a landlord and the contractor they select.
            </p>
          </section>

          <section>
            <h2>7. Contractor verification</h2>
            <p>
              Contractors may submit license and insurance information for review. A "Verified" badge
              means Prophandld has reviewed the documents a contractor submitted. It is not a
              guarantee of a contractor's work quality, licensing status at any given moment, or
              insurance coverage for a specific job. Landlords are responsible for their own diligence
              before hiring.
            </p>
          </section>

          <section>
            <h2>8. Payments</h2>
            <p>
              Rent (whether paid by debit card or bank transfer) and contractor job payments are
              processed through Stripe, a third-party payment processor; Prophandld does not hold
              or custody your funds. Money moves directly from the paying party to the recipient
              through Stripe's infrastructure. Landlords separately pay Prophandld a flat monthly
              platform fee based on how many units they manage; this fee is unrelated to and not
              deducted from any individual rent or job payment. Prophandld never sees or stores
              your card or bank account details; that information is handled entirely by Stripe.
            </p>
          </section>

          <section>
            <h2>9. AI Assist</h2>
            <p>
              AI Assist is an optional, paid add-on a landlord can turn on for their own account.
              When it's on, Prophandld uses a third-party AI service (see our{' '}
              <Link href="/privacy" className="text-[#12A5A9] hover:underline">Privacy Policy</Link>)
              to do things like suggest a next troubleshooting step, read an uploaded document,
              answer a renter's question about their own lease, or draft a routine message.
            </p>
            <p>
              These suggestions are generated automatically. They are not professional, legal, or
              contracting advice, and we don't guarantee they're accurate, complete, or safe for
              your specific situation. Never attempt an electrical, gas, or structural repair
              yourself regardless of what a suggestion says, and always use your own judgment
              before acting on one. AI Assist is provided "as is," same as the rest of the platform
              (see Section 12, Disclaimers, below).
            </p>
          </section>

          <section>
            <h2>10. Content you upload</h2>
            <p>
              You may upload photos, documents, and other content (job photos, lease documents,
              inspection reports, license/insurance files). You keep ownership of what you upload,
              but you grant Prophandld the right to store and display it to the people it's meant
              for. For example, before/after job photos are visible to the landlord, renter, and
              contractor involved in that job.
            </p>
            <p>
              Don't upload anything you don't have the right to share, and don't upload anything
              illegal, harassing, or knowingly false.
            </p>
          </section>

          <section>
            <h2>11. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Misrepresent your identity, role, or qualifications (especially licensing/insurance as a contractor)</li>
              <li>Use the platform to harass, discriminate against, or defraud another user</li>
              <li>Attempt to circumvent sealed bidding by coordinating prices with other contractors</li>
              <li>Scrape, reverse-engineer, or interfere with the platform's normal operation, including using any automated tool or process to extract data from Prophandld to train or fine-tune an AI model, large language model, or other machine learning system, without our prior written consent</li>
            </ul>
          </section>

          <section>
            <h2>12. Disclaimers</h2>
            <p>
              Prophandld is provided "as is." We do our best to keep it running and accurate, but we
              don't guarantee it will be uninterrupted, error-free, or that it will meet your specific
              needs. Prophandld is not responsible for the quality of maintenance work performed,
              disputes between landlords/renters/contractors, or losses arising from your use of the
              platform, to the fullest extent permitted by law.
            </p>
            <p>
              Where Prophandld staff review and resolve a dispute between users (for example, to
              decide whether a job payment should release), that decision is a platform and payment
              administration tool only. It is not a legal finding of fault or liability, is not
              binding arbitration, and does not waive or limit any party's other legal rights or
              remedies.
            </p>
            <p>
              Compliance tracking (license, certification, and inspection reminders) is a tool to
              help you stay on top of your own obligations, not a substitute for knowing or meeting
              them, and not a guarantee that you're in compliance with any law. To the fullest extent
              permitted by law, Prophandld LLC is not liable for any municipal fine, legal fee, lost
              rent, or other loss resulting from a landlord's failure to meet a local housing law or
              regulation, regardless of whether Prophandld sent, delayed, or omitted a related alert.
            </p>
          </section>

          <section>
            <h2>13. Termination</h2>
            <p>
              You can stop using Prophandld and delete your account at any time. We may suspend or
              terminate accounts that violate these terms or that we reasonably believe are being
              used fraudulently or abusively, including suspending an account we believe may be
              compromised, until the rightful owner's identity is confirmed.
            </p>
          </section>

          <section>
            <h2>14. Changes to these terms</h2>
            <p>
              We may update these terms as the platform evolves. For example, when new features like
              in-app rent payments launch. We'll update the date at the top of this page when we do.
              Continuing to use Prophandld after a change means you accept the updated terms.
            </p>
          </section>

          <section>
            <h2>15. Governing law</h2>
            <p>
              These terms are governed by the laws of the Commonwealth of Pennsylvania, without
              regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2>16. SMS Terms</h2>
            <p>
              Prophandld offers optional text message alerts for key job and scheduling updates: a
              new maintenance job opening near a contractor, an issue reported by a tenant, a
              proposed or confirmed appointment time, and a completed job ready for a landlord's
              review. These are account notifications, not marketing messages.
            </p>
            <p>
              Text alerts are off by default. You opt in from the Notifications section of your
              account settings by turning on "Text alerts," and you can turn them off there at any
              time. Message frequency varies with your account activity. Message and data rates may
              apply. Reply STOP to opt out at any time, or HELP for help. Carriers are not liable for
              delayed or undelivered messages. This SMS program is operated by Prophandld LLC.
            </p>
          </section>

          <section>
            <h2>17. Contact</h2>
            <p>
              Questions about these terms? Reach out at{' '}
              <a href="mailto:admin@prophandld.com" className="text-[#12A5A9] hover:underline">admin@prophandld.com</a>.
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-white/8 py-8">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between text-sm text-white/60">
          <span>© 2026 Prophandld LLC</span>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  )
}
