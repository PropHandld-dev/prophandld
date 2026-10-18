import Link from 'next/link'
import { LegalPageShell } from '@/components/LegalPageShell'

export const metadata = {
  title: 'Terms of Service for Renters | Prophandld',
}

export default function RenterTermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service — Renters"
      lastUpdated="October 19, 2026"
      footerLinks={
        <>
          <Link href="/terms" className="hover:text-white transition">General Terms</Link>
          <Link href="/terms/landlord" className="hover:text-white transition">Landlord Terms</Link>
          <Link href="/terms/contractor" className="hover:text-white transition">Contractor Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </>
      }
    >
      <section>
        <h2>1. What this covers</h2>
        <p>
          This page is the complete Terms of Service for using Prophandld as a renter — everything
          relevant to your role in one place. It&apos;s part of the same agreement as our{' '}
          <Link href="/terms" className="text-[#12A5A9] hover:underline">General Terms</Link>, which
          covers the platform as a whole; where the two overlap, this page has the specifics for your
          role. By creating or using a renter account, you agree to both.
        </p>
        <p>
          Prophandld is operated by Prophandld LLC, a Pennsylvania limited liability company.
          Prophandld connects landlords, renters, and contractors: your landlord manages your unit
          through it, you report maintenance issues and pay rent through it, and contractors bid on
          and perform the repair work.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <p>
          You&apos;re responsible for keeping your login credentials secure and for the accuracy of the
          contact information you provide. Your landlord creates your tenancy and invites you by email
          or phone; once you sign up and accept, you&apos;re linked to your unit automatically.
        </p>
        <p>
          <strong>Co-renters.</strong> Your landlord can add another adult in your household — a
          roommate, a spouse, anyone else actually living there — as a co-renter on the same unit.
          A co-renter can report issues and see shared documents just like you can; rent is one shared
          amount for the household either way, not split or tracked separately per person. You&apos;re
          responsible for keeping any co-renter or backup contact information you provide accurate.
        </p>
        <p>
          If you genuinely act in more than one role (for example, you&apos;re also a contractor
          elsewhere), you can link a second role profile to the same identity from your Profile page
          and switch between them. You&apos;re responsible for how every profile linked to you is used.
        </p>
      </section>

      <section>
        <h2>3. Your responsibilities</h2>
        <p>As a renter using Prophandld, you agree to:</p>
        <ul>
          <li>Report maintenance issues honestly and provide a reasonably accurate description — including marking something an emergency only when it actually is one</li>
          <li>Provide reasonable access for a scheduled contractor visit or inspection, or communicate promptly if a scheduled time no longer works</li>
          <li>Pay rent on time through the method you and your landlord have set up, and not use the platform to misrepresent whether a payment was made</li>
          <li>Keep any co-renter or backup contact information you provide accurate, and take responsibility for a co-renter you add to your unit</li>
          <li>Not use any contact information you gain through a job (for example, a contractor&apos;s) for anything outside that job</li>
        </ul>
      </section>

      <section>
        <h2>4. Reporting an issue and sealed bidding</h2>
        <p>
          When you report a maintenance issue — a category, a photo, a short description, and whether
          it&apos;s an emergency — your landlord is notified right away and can open it for bidding.
          Contractors then submit sealed bids: their price, availability, and notes, without seeing
          what anyone else bid. Your landlord chooses who does the work; Prophandld doesn&apos;t set
          prices or guarantee any particular outcome, and isn&apos;t a party to the agreement between your
          landlord and the contractor they select. You&apos;ll be notified as the job moves through
          scheduling, in progress, and completion.
        </p>
        <p>
          Mark something an emergency only when it genuinely can&apos;t wait — the app will show you what
          qualifies. Emergency jobs are treated with priority on the contractor side.
        </p>
      </section>

      <section>
        <h2>5. Contractor verification</h2>
        <p>
          A contractor working on your unit may carry a &quot;Verified&quot; badge, meaning Prophandld has
          reviewed the license and insurance documents they submitted. It is not a guarantee of their
          work quality, their licensing status at any given moment, or their insurance coverage for
          your specific job. Unverified contractors can also work through the platform; they&apos;re just
          labeled as such.
        </p>
      </section>

      <section>
        <h2>6. Payments</h2>
        <p>
          <strong>Paying rent.</strong> You can pay rent by debit card or bank transfer through
          Stripe, a third-party payment processor — Prophandld never sees or stores your card or bank
          account details, that&apos;s handled entirely by Stripe. Credit cards aren&apos;t accepted for rent,
          on purpose, so you&apos;re not tempted into card debt to make rent. If your landlord has set one
          up, you can also pay rent directly to them via Zelle, Venmo, or Cash App instead — money
          never touches Prophandld or Stripe for those. Those payments aren&apos;t confirmed
          automatically; after sending one, you can tap &quot;I&apos;ve sent this payment&quot; to let your landlord
          know to check for it, but your landlord&apos;s own &quot;Mark received&quot; action is what actually
          records it as paid, the same as it would for cash or a check.
        </p>
        <p>
          <strong>Receipts.</strong> Every rent payment and every contractor payment on a job you&apos;re
          part of gets a receipt, emailed to you and saved on the payment record.
        </p>
        <p>
          Using Prophandld as a renter has no fee to you beyond your actual rent — Prophandld&apos;s
          subscription fee is paid by your landlord, never passed through to you.
        </p>
      </section>

      <section>
        <h2>7. Content you upload</h2>
        <p>
          You may upload photos and documents — job photos, access notes, and similar content. You
          keep ownership of what you upload, but you grant Prophandld the right to store it and
          display it to the people it&apos;s meant for (for example, your issue-report photos are visible
          to your landlord and the contractor assigned to that job). Don&apos;t upload anything you don&apos;t
          have the right to share, and don&apos;t upload anything illegal, harassing, or knowingly false.
        </p>
      </section>

      <section>
        <h2>8. Disputes</h2>
        <p>
          After your landlord approves a job, any party on it — you, your landlord, or the contractor
          — can raise a dispute within 48 hours, which pauses the job until it&apos;s sorted out.
          Prophandld&apos;s team reviews a raised dispute and makes a decision to resolve it as a platform
          and payment administration tool only — not a legal finding of fault, not binding
          arbitration, and it doesn&apos;t waive or limit any party&apos;s other legal rights or remedies
          (including your rights under landlord-tenant law, which this process doesn&apos;t replace).
        </p>
      </section>

      <section>
        <h2>9. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Misrepresent your identity or who actually lives in your unit</li>
          <li>Use the platform to harass, discriminate against, or defraud another user</li>
          <li>Report an issue dishonestly, or mark something an emergency when it isn&apos;t, to jump the queue</li>
          <li>Scrape, reverse-engineer, or interfere with the platform&apos;s normal operation</li>
        </ul>
      </section>

      <section>
        <h2>10. Disclaimers</h2>
        <p>
          Prophandld is provided &quot;as is.&quot; We do our best to keep it running and accurate, but we don&apos;t
          guarantee it will be uninterrupted, error-free, or that it will meet your specific needs.
          Prophandld is not responsible for the quality of maintenance work performed, disputes
          between you and your landlord or a contractor, or losses arising from your use of the
          platform, to the fullest extent permitted by law.
        </p>
      </section>

      <section>
        <h2>11. Termination</h2>
        <p>
          You can stop using Prophandld and delete your account at any time (note that your tenancy
          itself is a separate agreement with your landlord, outside Prophandld). We may suspend or
          terminate accounts that violate these terms or that we reasonably believe are being used
          fraudulently or abusively.
        </p>
      </section>

      <section>
        <h2>12. Changes to these terms</h2>
        <p>
          We may update these terms as the platform evolves — for example, when a new feature like
          in-app rent payments launches. We&apos;ll update the date at the top of this page when we do.
          Continuing to use Prophandld after a change means you accept the updated terms.
        </p>
      </section>

      <section>
        <h2>13. Governing law</h2>
        <p>
          These terms are governed by the laws of the Commonwealth of Pennsylvania, without regard to
          conflict of law principles.
        </p>
      </section>

      <section>
        <h2>14. SMS Terms</h2>
        <p>
          Prophandld offers optional text message alerts for key job and scheduling updates: a new
          job to bid on near you isn&apos;t relevant as a renter, but scheduling updates and a completed
          job ready for review are. These are account notifications, not marketing messages. Text
          alerts are off by default — you opt in from the Notifications section of your account
          settings, and can turn them off there at any time. Message frequency varies with your
          account activity. Message and data rates may apply. Reply STOP to opt out at any time, or
          HELP for help. Carriers are not liable for delayed or undelivered messages. This SMS program
          is operated by Prophandld LLC. See our full{' '}
          <Link href="/sms-consent" className="text-[#12A5A9] hover:underline">SMS Consent</Link> page
          for more detail.
        </p>
      </section>

      <section>
        <h2>15. Contact</h2>
        <p>
          Questions about these terms? Reach out at{' '}
          <a href="mailto:admin@prophandld.com" className="text-[#12A5A9] hover:underline">admin@prophandld.com</a>,
          or use Contact Us from your Profile page once you&apos;re signed in.
        </p>
      </section>
    </LegalPageShell>
  )
}
