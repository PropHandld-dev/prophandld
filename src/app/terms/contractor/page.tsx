import Link from 'next/link'
import { LegalPageShell } from '@/components/LegalPageShell'

export const metadata = {
  title: 'Terms of Service for Contractors | Prophandld',
}

export default function ContractorTermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service — Contractors"
      lastUpdated="October 19, 2026"
      footerLinks={
        <>
          <Link href="/terms" className="hover:text-white transition">General Terms</Link>
          <Link href="/terms/landlord" className="hover:text-white transition">Landlord Terms</Link>
          <Link href="/terms/renter" className="hover:text-white transition">Renter Terms</Link>
          <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
        </>
      }
    >
      <section>
        <h2>1. What this covers</h2>
        <p>
          This page is the complete Terms of Service for using Prophandld as a contractor —
          everything relevant to your role in one place. It&apos;s part of the same agreement as our{' '}
          <Link href="/terms" className="text-[#12A5A9] hover:underline">General Terms</Link>, which
          covers the platform as a whole; where the two overlap, this page has the specifics for your
          role. By creating or using a contractor account, you agree to both.
        </p>
        <p>
          Prophandld is operated by Prophandld LLC, a Pennsylvania limited liability company.
          Prophandld connects you with landlords posting maintenance jobs: you submit a sealed bid,
          the landlord picks who does the work, and you get paid directly once it&apos;s approved.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <p>
          You&apos;re responsible for keeping your login credentials secure and for the accuracy of your
          profile, including the trades and service radius you set and any license/insurance
          information you submit. A landlord can invite you directly by email or phone, or you can
          find jobs that match your trade and ZIP-code radius on your own.
        </p>
        <p>
          If you genuinely act in more than one role (for example, you&apos;re also a landlord
          elsewhere), you can link a second role profile to the same identity from your Profile page
          and switch between them. You&apos;re responsible for how every profile linked to you is used —
          using a linked profile to see or influence your own bid as the landlord side of a job isn&apos;t
          allowed, whether or not our systems happen to catch a specific attempt.
        </p>
      </section>

      <section>
        <h2>3. Your responsibilities</h2>
        <p>As a contractor using Prophandld, you agree to:</p>
        <ul>
          <li>Submit accurate, current license and insurance information if you choose to, and tell us promptly if either lapses or changes</li>
          <li>Perform work you bid on professionally, safely, and to the applicable code for your trade — a &quot;Verified&quot; badge reflects document review, not a guarantee of your work (see Section 5)</li>
          <li>Honor a sealed bid you submit, and not withdraw from or materially change a job&apos;s scope after a landlord selects you except through the platform&apos;s price-change process</li>
          <li>Never attempt to see, infer, or coordinate on another contractor&apos;s bid, and never ask a landlord or renter what a competing bid was</li>
          <li>Not solicit a landlord or renter to pay you directly, off-platform, for a job that started on Prophandld, in a way meant to avoid the platform&apos;s payment and dispute protections</li>
        </ul>
      </section>

      <section>
        <h2>4. Sealed bidding</h2>
        <p>
          You submit your price, availability, and any notes privately — you can&apos;t see what anyone
          else bid, and no one can see yours. The landlord chooses who to select, and price doesn&apos;t
          have to be the deciding factor; being thorough and responsive in your bid matters.
          Prophandld doesn&apos;t set prices, doesn&apos;t guarantee you&apos;ll be selected, and isn&apos;t a party to
          the agreement between you and the landlord who selects you. If the job&apos;s scope genuinely
          changes after you&apos;re selected, you can request a price change through the platform — the
          landlord has to approve it before the new price applies; you can&apos;t just unilaterally change
          what you charge mid-job.
        </p>
      </section>

      <section>
        <h2>5. Verification</h2>
        <p>
          You can optionally submit license and insurance documents for review. A &quot;Verified&quot; badge
          means Prophandld has reviewed what you submitted — it doesn&apos;t guarantee your work quality,
          your licensing status at any given moment, or your coverage for a specific job, and it
          isn&apos;t a license or endorsement from Prophandld itself. You can bid and work through the
          platform without it; you&apos;ll just be labeled as unverified, and some landlords weight that
          heavily and some don&apos;t.
        </p>
      </section>

      <section>
        <h2>6. Getting paid</h2>
        <p>
          Using Prophandld as a contractor is completely free — no platform fee, no cut of your bid,
          ever. Once a landlord approves your completed work, payment moves directly from them to you
          through Stripe, a third-party payment processor; Prophandld does not hold or custody the
          funds at any point, and never sees or stores your bank account details — that&apos;s handled
          entirely by Stripe. A completed job auto-approves three days after you mark it done if the
          landlord hasn&apos;t acted on it, so you&apos;re not left waiting indefinitely for an unresponsive
          landlord to release payment. Every payment gets a receipt, emailed to you and saved on the
          job record.
        </p>
      </section>

      <section>
        <h2>7. Content you upload</h2>
        <p>
          You may upload photos, documents, and other content — before/after job photos, license and
          insurance files. You keep ownership of what you upload, but you grant Prophandld the right
          to store it and display it to the people it&apos;s meant for (for example, your job photos are
          visible to the landlord and renter on that job; license/insurance documents are visible only
          to our verification review and, once approved, shown only as a &quot;Verified&quot; status, not the
          documents themselves). Don&apos;t upload anything you don&apos;t have the right to share, and don&apos;t
          upload anything illegal, harassing, or knowingly false.
        </p>
      </section>

      <section>
        <h2>8. Disputes</h2>
        <p>
          After a landlord approves a job, any party on it — you, the landlord, or the renter — can
          raise a dispute within 48 hours, which pauses the job (and your payment) until it&apos;s sorted
          out. Prophandld&apos;s team reviews a raised dispute and makes a decision to resolve it as a
          platform and payment administration tool only — not a legal finding of fault, not binding
          arbitration, and it doesn&apos;t waive or limit any party&apos;s other legal rights or remedies.
        </p>
      </section>

      <section>
        <h2>9. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Misrepresent your identity, qualifications, or licensing/insurance status</li>
          <li>Use the platform to harass, discriminate against, or defraud another user</li>
          <li>Attempt to circumvent sealed bidding by coordinating prices with other contractors, or by seeing a competing bid</li>
          <li>Scrape, reverse-engineer, or interfere with the platform&apos;s normal operation</li>
        </ul>
      </section>

      <section>
        <h2>10. Disclaimers</h2>
        <p>
          Prophandld is provided &quot;as is.&quot; We do our best to keep it running and accurate, but we don&apos;t
          guarantee it will be uninterrupted, error-free, or that it will meet your specific needs.
          Prophandld is not responsible for disputes between you and a landlord or renter, or losses
          arising from your use of the platform, to the fullest extent permitted by law. Prophandld
          does not guarantee you any particular volume of job alerts, bids won, or income.
        </p>
      </section>

      <section>
        <h2>11. Termination</h2>
        <p>
          You can stop using Prophandld and delete your account at any time. We may suspend or
          terminate accounts that violate these terms or that we reasonably believe are being used
          fraudulently or abusively, including repeated attempts to circumvent sealed bidding.
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
          Prophandld offers optional text message alerts for key job updates: a new maintenance job
          opening near you, an emergency issue, scheduling updates, and price-change responses. These
          are account notifications, not marketing messages. Text alerts are off by default — you opt
          in from the Notifications section of your account settings, and can turn them off there at
          any time. Message frequency varies with your account activity and how many jobs match your
          trade and service radius. Message and data rates may apply. Reply STOP to opt out at any
          time, or HELP for help. Carriers are not liable for delayed or undelivered messages. This
          SMS program is operated by Prophandld LLC. See our full{' '}
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
