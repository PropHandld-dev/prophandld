import Link from 'next/link'

// Addendum for property management companies and their staff. Applies on
// top of the Landlord Terms (a PM account is a landlord account with a PM
// organization attached).
export function PropertyManagerTermsContent() {
  return (
    <>
      <section>
        <h2>1. Who this applies to</h2>
        <p>
          These terms apply to any property management company (a &quot;PM&quot;) that sets up an
          organization on Prophandld, and to everyone the PM adds as staff. They add to our{' '}
          <Link href="/terms/landlord" className="text-[#12A5A9] hover:underline">Landlord Terms</Link> and{' '}
          <Link href="/terms" className="text-[#12A5A9] hover:underline">General Terms</Link>. If anything here
          conflicts with those, this page wins for PM activity.
        </p>
      </section>

      <section>
        <h2>2. You act for your clients</h2>
        <p>
          When you manage an owner&apos;s properties on Prophandld, you act as that owner&apos;s agent. You
          confirm that you have the owner&apos;s permission, usually a written management agreement, for
          everything you do for them here: approving jobs, paying contractors, adding properties, inviting
          tenants and collecting rent. The owner can limit what you approve on your own (their approval
          limit), turn on read-only mode, or end your access at any time.
        </p>
        <p>
          You are responsible for everyone on your team. Give staff access only to the clients they work on,
          and remove people who leave.
        </p>
      </section>

      <section>
        <h2>3. Licenses</h2>
        <p>
          Managing property for others for a fee can require a real estate broker license, depending on the
          state and the work. In Pennsylvania this is generally the case. You are responsible for holding
          every license your work requires. If you enter a license number or confirm that you hold client money
          in a trust or escrow account, that statement must be true and kept current. We may pause features,
          such as collecting rent for clients, if it is not.
        </p>
      </section>

      <section>
        <h2>4. Client money</h2>
        <p>
          Rent goes to the owner by default. It goes to you only if you request it, confirm your broker license
          and trust account, and the owner approves. The owner can switch it back at any time. Money moves
          through Stripe directly to the account that receives it. Prophandld never holds client funds and does
          not decide when money moves.
        </p>
        <p>
          You hold any rent and security deposits you receive in trust, as the law requires, and pay owners
          under your agreement with them. Disagreements about money between you and an owner are between you
          and the owner.
        </p>
      </section>

      <section>
        <h2>5. Management fees</h2>
        <p>
          You can propose a management fee to each client in the app. Nothing is charged until the owner
          approves it, and any change is sent to them for approval again. Fees are paid by Stripe to your own
          account. Prophandld takes no part of your fee. Stripe&apos;s processing fee is shown before the owner
          pays.
        </p>
      </section>

      <section>
        <h2>6. Tenant and owner information</h2>
        <p>
          You can see your clients&apos; properties, tenants, jobs, rent and documents only to manage those
          properties. Don&apos;t use or share this information for anything else, including marketing, and
          don&apos;t copy it out of Prophandld except as your work and the law require. Our{' '}
          <Link href="/privacy" className="text-[#12A5A9] hover:underline">Privacy Policy</Link> explains what we
          do with it. Prophandld AI can use your clients&apos; account details to answer your questions and draft
          messages; review any draft before you send it, since what you send is yours.
        </p>
      </section>

      <section>
        <h2>7. When management ends</h2>
        <p>
          Either side can end management in the app. Access for you and your staff stops right away, and rent
          goes back to the owner&apos;s own account. You agree to hand over any security deposits and client
          funds you hold, with a written accounting, and to give the owner the records they need, as your
          agreement and the law require. Paid fees and your activity stay in both sides&apos; records.
        </p>
      </section>

      <section>
        <h2>8. Your public profile and reviews</h2>
        <p>
          Everything on your public profile must be accurate, including licenses, insurance, years in business
          and team members. Don&apos;t post, buy or pressure clients for reviews, and don&apos;t review
          yourself. We may remove content that is false or misleading.
        </p>
      </section>

      <section>
        <h2>9. Messages, approvals and AI</h2>
        <p>
          Messages and approval requests between you and your clients are kept as a record. An approval an
          owner gives in a conversation counts only for the item and amount shown. AI can draft messages and
          summaries for you; you are responsible for anything you send.
        </p>
      </section>

      <section>
        <h2>10. Fair housing</h2>
        <p>
          You must follow all fair housing laws in how you advertise, screen, rent and manage. Prophandld&apos;s
          tools, including AI lease drafts and screening, do not replace your own legal duties.
        </p>
      </section>

      <section>
        <h2>11. Suspension</h2>
        <p>
          We may suspend a PM organization or staff member that breaks these terms, misuses client money or
          data, or puts tenants or owners at risk. Where we can, we tell you first and give you a chance to fix
          it.
        </p>
      </section>
    </>
  )
}
