import Link from 'next/link'
import { LegalPageShell } from '@/components/LegalPageShell'

export const metadata = {
  title: 'Terms of Service for Landlords | Prophandld',
}

export default function LandlordTermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service — Landlords"
      lastUpdated="October 20, 2026"
      footerLinks={
        <>
          <Link href="/terms" className="hover:text-white transition">General Terms</Link>
          <Link href="/terms/renter" className="hover:text-white transition">Renter Terms</Link>
          <Link href="/terms/contractor" className="hover:text-white transition">Contractor Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </>
      }
    >
      <section>
        <h2>1. What this covers</h2>
        <p>
          This page is the complete Terms of Service for using Prophandld as a landlord — everything
          relevant to your role in one place, so you don&apos;t have to read sections meant for renters
          or contractors to find what applies to you. It&apos;s part of the same agreement as our{' '}
          <Link href="/terms" className="text-[#12A5A9] hover:underline">General Terms</Link>, which
          covers the platform as a whole; where the two overlap, this page has the specifics for your
          role. By creating or using a landlord account, you agree to both.
        </p>
        <p>
          Prophandld is operated by Prophandld LLC, a Pennsylvania limited liability company.
          Prophandld connects landlords, renters, and contractors to manage rental properties and
          coordinate maintenance work: you track your properties, units, and tenants; your renters
          report issues; contractors submit sealed bids and you pick who does the work.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <p>
          You&apos;re responsible for keeping your login credentials secure and for the accuracy of the
          property, unit, and lease information you enter — address, rent amount, unit count, and who
          actually lives there. If you act in more than one role (for example, you also pick up
          contracting work yourself), you can link a second role profile to the same identity from
          your Profile page and switch between them; you&apos;re responsible for how every profile linked
          to you is used, and using a linked profile to bid on, select, or review your own jobs isn&apos;t
          allowed, whether or not our systems happen to catch a specific attempt.
        </p>
        <p>
          <strong>Co-owners.</strong> You can invite a co-owner — a business partner, a property
          manager, or anyone else you want managing alongside you — from your Profile page, by their
          email or phone number. A co-owner gets your own full access to your properties, units,
          tenants, jobs, rent tracking, and compliance tracking; they can&apos;t see or change your
          subscription billing, and can&apos;t permanently delete a property. You can remove a co-owner&apos;s
          access at any time, and you&apos;re responsible for who you invite and for their use of that
          access — including any job, payment, or tenant communication they make while they have it. A
          co-owner can manage only one landlord&apos;s portfolio at a time.
        </p>
      </section>

      <section>
        <h2>3. Your responsibilities</h2>
        <p>As a landlord using Prophandld, you agree to:</p>
        <ul>
          <li>Provide accurate information about your properties, units, and lease terms, and keep it current as things change</li>
          <li>Keep required licenses, certifications, and inspections (for example, a rental license or lead certification where your jurisdiction requires one) current — the platform&apos;s compliance tracking is a reminder tool, not a substitute for knowing your own legal obligations</li>
          <li>Respond to reported maintenance issues in a reasonable time, and not use the platform to avoid habitability or repair obligations you have under applicable law</li>
          <li>Pay contractors the full amount you approve for completed work, on the timeline the platform describes, and pay your own Prophandld subscription fee on time</li>
          <li>Respect a renter&apos;s privacy — only use their contact information and personal data for managing the tenancy, never for an unrelated purpose</li>
          <li>Take responsibility for any co-owner you invite, including their use of the access you grant them (see Section 2)</li>
          <li>If you accept rent via a third-party app like Zelle, Venmo, or Cash App (see Section 6), make your own informed call about any fees or account-use terms that app imposes on you — Prophandld isn&apos;t a party to your account with them</li>
        </ul>
      </section>

      <section>
        <h2>4. Posting jobs and sealed bidding</h2>
        <p>
          When you (or your renter) report a maintenance issue, or you open a job directly, it goes
          out to matching contractors — filtered by trade and a service radius around the property&apos;s
          ZIP code — who submit sealed bids: their price, availability, and any notes, without seeing
          what anyone else bid. You choose who to select; price doesn&apos;t have to be the deciding factor.
          Prophandld doesn&apos;t set prices, doesn&apos;t guarantee any particular outcome from bidding, and
          isn&apos;t a party to the agreement between you and the contractor you select. Once you select a
          bid, the contractor can request a price change through the platform if the scope genuinely
          changes; you have to approve it before the new price applies.
        </p>
        <p>
          A completed job auto-approves three days after a contractor marks it done if you haven&apos;t
          acted on it — you&apos;ll be notified before that happens, and you&apos;re still the one who
          actually releases payment.
        </p>
      </section>

      <section>
        <h2>5. Contractor verification</h2>
        <p>
          Contractors may submit license and insurance information for review. A &quot;Verified&quot; badge
          means Prophandld has reviewed the documents a contractor submitted — it is not a guarantee
          of their work quality, their licensing status at any given moment, or their insurance
          coverage for your specific job. An unverified contractor can still bid and work through the
          platform; they&apos;re just labeled as such so you can decide. You&apos;re responsible for your own
          diligence before hiring anyone, verified or not.
        </p>
      </section>

      <section>
        <h2>6. Payments</h2>
        <p>
          <strong>Paying contractors.</strong> Job payments are processed through Stripe, a
          third-party payment processor; Prophandld does not hold or custody your funds. Money moves
          directly from you to the contractor through Stripe&apos;s infrastructure once you approve
          completed work.
        </p>
        <p>
          <strong>Collecting rent.</strong> Your renter can pay rent by debit card or bank transfer
          through Stripe, same as job payments — Prophandld never sees or stores card or bank account
          details, that&apos;s handled entirely by Stripe. You can also optionally list a Zelle, Venmo, or
          Cash App handle on your Profile for your renter to pay you directly, outside Stripe
          entirely. Zelle has no fee and no risk to your account either way. Venmo and Cash App both
          charge a fee for this kind of payment and, under their own terms, aren&apos;t meant for business
          use like rent — a small number of accounts have been restricted over exactly this, which is
          why Prophandld shows you that risk plainly before you add either handle; it&apos;s your decision
          to make, not ours. None of these three methods are confirmed automatically — your own &quot;Mark
          received&quot; action on the rent page is what records a payment as received, the same as it
          would for cash or a check. If you change a handle, we freeze new payments to it for 48
          hours and alert you by email/push — if that wasn&apos;t you, contact us right away.
        </p>
        <p>
          <strong>Your subscription.</strong> You separately pay Prophandld a graduated monthly
          platform fee based on how many units you manage — see current pricing at{' '}
          <Link href="/pricing" className="text-[#12A5A9] hover:underline">prophandld.com/pricing</Link>.
          This fee is unrelated to, and never deducted from, any individual rent or job payment. Your
          first unit is free. A co-owner you&apos;ve invited sees their own account&apos;s billing (typically
          free, since they&apos;re not the unit owner), never yours.
        </p>
      </section>

      <section>
        <h2>7. Content you upload</h2>
        <p>
          You may upload photos, documents, and other content — job photos, lease documents,
          inspection reports, compliance records, license/insurance files you&apos;ve collected. You keep
          ownership of what you upload, but you grant Prophandld the right to store it and display it
          to the people it&apos;s meant for (for example, before/after job photos are visible to you, your
          renter, and the contractor on that job). Don&apos;t upload anything you don&apos;t have the right to
          share, and don&apos;t upload anything illegal, harassing, or knowingly false.
        </p>
      </section>

      <section>
        <h2>8. Disputes</h2>
        <p>
          After you approve a job, any party on it — you, your renter, or the contractor — can raise a
          dispute within 48 hours, which pauses the job until it&apos;s sorted out. Prophandld&apos;s team
          reviews a raised dispute and makes a decision to resolve it as a platform and payment
          administration tool only — not a legal finding of fault, not binding arbitration, and it
          doesn&apos;t waive or limit any party&apos;s other legal rights or remedies.
        </p>
      </section>

      <section>
        <h2>9. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Misrepresent your identity, your properties, or the terms you&apos;ve described to a renter or contractor</li>
          <li>Use the platform to harass, discriminate against, or defraud another user</li>
          <li>Attempt to see or influence a sealed bid before it&apos;s submitted, or coordinate pricing with a contractor outside the normal bidding process</li>
          <li>Scrape, reverse-engineer, or interfere with the platform&apos;s normal operation</li>
        </ul>
      </section>

      <section>
        <h2>10. Disclaimers</h2>
        <p>
          Prophandld is provided &quot;as is.&quot; We do our best to keep it running and accurate, but we don&apos;t
          guarantee it will be uninterrupted, error-free, or that it will meet your specific needs.
          Prophandld is not responsible for the quality of maintenance work performed, disputes
          between you and a renter or contractor, or losses arising from your use of the platform, to
          the fullest extent permitted by law.
        </p>
      </section>

      <section>
        <h2>11. Termination</h2>
        <p>
          You can stop using Prophandld and delete your account at any time. We may suspend or
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
          issue reported, a new job to bid on, scheduling, and a completed job ready for your review.
          These are account notifications, not marketing messages. Text alerts are off by default —
          you opt in from the Notifications section of your account settings, and can turn them off
          there at any time. Message frequency varies with your account activity. Message and data
          rates may apply. Reply STOP to opt out at any time, or HELP for help. Carriers are not
          liable for delayed or undelivered messages. This SMS program is operated by Prophandld LLC.
          See our full{' '}
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
