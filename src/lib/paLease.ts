// Pennsylvania residential lease template. The legally sensitive sections
// (security deposit, disclosures, notices) are fixed text filled with the
// landlord's details; AI only writes the "Additional terms" from the
// landlord's own notes and flags possible problems. Not legal advice: the
// page tells the user to have a PA attorney review before signing.

export type UtilityPayer = 'tenant' | 'landlord'
export type LeaseInputs = {
  landlordName: string
  agentName: string | null
  tenantNames: string[]
  address: string
  unitLabel: string | null
  city: string
  state: string
  zip: string
  startDate: string
  endDate: string | null
  rent: number
  dueDay: number
  lateFee: number
  graceDays: number
  deposit: number
  occupants: string
  pets: 'none' | 'allowed' | 'with_approval'
  petDeposit: number
  smoking: boolean
  utilities: Record<'electric' | 'gas' | 'water' | 'sewer' | 'trash' | 'internet', UtilityPayer>
  parking: string
  builtBefore1978: 'yes' | 'no' | 'unknown'
  inPhiladelphia: boolean
  noticeToVacateDays: number
  escalationPercent: number | null
  extraNotes: string
}
export type LeaseClause = { title: string; text: string }
export type LeaseFlag = { severity: 'warning' | 'info'; message: string }
export type LeaseSection = { title: string; paragraphs: string[] }

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
const UTIL_LABELS: Record<string, string> = { electric: 'Electricity', gas: 'Gas', water: 'Water', sewer: 'Sewer', trash: 'Trash collection', internet: 'Internet and cable' }

// Checks that don't need AI: the clear Pennsylvania rules and obvious gaps.
export function ruleFlags(i: LeaseInputs): LeaseFlag[] {
  const flags: LeaseFlag[] = []
  if (i.rent > 0 && i.deposit > i.rent * 2) {
    flags.push({ severity: 'warning', message: `Pennsylvania caps the security deposit at two months' rent in the first year (${money(i.rent * 2)} here). Lower the deposit.` })
  }
  if (i.rent > 0 && i.deposit + i.petDeposit > i.rent * 2) {
    flags.push({ severity: 'warning', message: 'The security deposit plus pet deposit is more than two months\' rent. Pennsylvania counts both toward the cap in the first year.' })
  }
  if (i.rent > 0 && i.lateFee > i.rent * 0.1) {
    flags.push({ severity: 'warning', message: `A late fee over 10% of rent (${money(i.lateFee)}) may be seen as unreasonable by a court. Consider lowering it.` })
  }
  if (i.endDate && i.endDate <= i.startDate) flags.push({ severity: 'warning', message: 'The end date is before the start date.' })
  if (i.tenantNames.filter(Boolean).length === 0) flags.push({ severity: 'warning', message: 'Add at least one tenant name.' })
  if (i.builtBefore1978 !== 'no') {
    flags.push({ severity: 'info', message: 'Homes built before 1978 need the federal lead-based paint disclosure form and the EPA pamphlet "Protect Your Family From Lead in Your Home", signed before the lease.' })
  }
  if (i.inPhiladelphia) {
    flags.push({ severity: 'info', message: 'Philadelphia: give the tenant a Certificate of Rental Suitability and the "Partners for Good Housing" handbook, and have a current rental license. Pre-1978 units with a child 6 or under need a lead-safe or lead-free certificate.' })
  }
  if (!i.endDate) flags.push({ severity: 'info', message: 'Month-to-month: either side can end it with the written notice you set below.' })
  return flags
}

export function buildLeaseSections(i: LeaseInputs, extra: LeaseClause[]): LeaseSection[] {
  const tenants = i.tenantNames.filter(Boolean)
  const tenantList = tenants.length ? tenants.join(', ') : '________________'
  const premises = `${i.address}${i.unitLabel ? `, ${i.unitLabel}` : ''}, ${i.city}, ${i.state} ${i.zip}`
  const tenantPays = Object.entries(i.utilities).filter(([, v]) => v === 'tenant').map(([k]) => UTIL_LABELS[k])
  const landlordPays = Object.entries(i.utilities).filter(([, v]) => v === 'landlord').map(([k]) => UTIL_LABELS[k])

  const sections: LeaseSection[] = [
    {
      title: '1. Parties',
      paragraphs: [
        `This Residential Lease ("Lease") is between ${i.landlordName} ("Landlord")${i.agentName ? `, through its managing agent ${i.agentName}` : ''}, and ${tenantList} ("Tenant"). If there is more than one Tenant, each is fully responsible for all obligations under this Lease.`,
      ],
    },
    { title: '2. Property', paragraphs: [`Landlord rents to Tenant the home at ${premises} (the "Property").${i.parking ? ` Parking: ${i.parking}.` : ''}`] },
    {
      title: '3. Term',
      paragraphs: [
        i.endDate
          ? `The Lease starts on ${date(i.startDate)} and ends on ${date(i.endDate)}. If neither side gives written notice at least ${i.noticeToVacateDays} days before the end date, the Lease continues month to month on the same terms, and either side may end it with ${i.noticeToVacateDays} days' written notice.`
          : `The Lease starts on ${date(i.startDate)} and continues month to month. Either side may end it with at least ${i.noticeToVacateDays} days' written notice.`,
      ],
    },
    {
      title: '4. Rent',
      paragraphs: [
        `Rent is ${money(i.rent)} per month, due on the ${ordinal(i.dueDay)} day of each month. Tenant may pay through Prophandld by bank transfer at no fee, or by debit card (which carries a card processing fee shown before paying), or another way Landlord accepts in writing.`,
        ...(i.escalationPercent ? [`Rent increases by ${i.escalationPercent}% at each renewal or yearly anniversary of this Lease, with at least 30 days' written notice.`] : []),
      ],
    },
    {
      title: '5. Late payment',
      paragraphs: [
        i.lateFee > 0
          ? `If rent is not received within ${i.graceDays} day${i.graceDays === 1 ? '' : 's'} after the due date, Tenant owes a late fee of ${money(i.lateFee)}.`
          : 'No late fee is charged. Late rent is still a breach of this Lease.',
      ],
    },
    {
      title: '6. Security deposit',
      paragraphs: [
        `Tenant pays a security deposit of ${money(i.deposit)}${i.petDeposit > 0 ? ` plus a pet deposit of ${money(i.petDeposit)}` : ''}. Under the Pennsylvania Landlord and Tenant Act of 1951, a deposit may not exceed two months' rent during the first year, or one month's rent after the first year.`,
        'If the deposit is held for more than two years, Landlord will hold any amount over $100 in an interest-bearing escrow account and pay Tenant the interest earned, less the 1% administrative fee the law allows, starting at the end of the second year.',
        'Within 30 days after the Lease ends and Tenant moves out, Landlord will return the deposit or send Tenant a written, itemized list of damages with any remaining balance. Tenant must give Landlord a forwarding address in writing. Normal wear and tear is not damage.',
      ],
    },
    {
      title: '7. Utilities',
      paragraphs: [
        tenantPays.length ? `Tenant pays for: ${tenantPays.join(', ')}.` : 'Tenant pays for no utilities.',
        landlordPays.length
          ? `Landlord pays for: ${landlordPays.join(', ')}. Where Landlord passes a utility bill to Tenant, it will be added to the month's rent with the bill attached in Prophandld.`
          : 'Landlord pays for no utilities.',
      ],
    },
    { title: '8. Occupants', paragraphs: [`Only Tenant${i.occupants ? ` and these occupants: ${i.occupants}` : ''} may live at the Property. Guests may stay up to 14 days in any six months without Landlord's written consent.`] },
    {
      title: '9. Pets',
      paragraphs: [
        i.pets === 'none'
          ? 'No pets are allowed without Landlord\'s written consent. Service animals and assistance animals are allowed as required by fair housing law.'
          : i.pets === 'with_approval'
            ? 'Pets are allowed only with Landlord\'s prior written approval for each animal. Service animals and assistance animals are allowed as required by fair housing law.'
            : 'Pets are allowed. Tenant is responsible for any damage, waste or disturbance a pet causes. Service animals and assistance animals are allowed as required by fair housing law.',
      ],
    },
    { title: '10. Use of the property', paragraphs: [`The Property is a private residence only. Tenant will follow all laws and not disturb neighbors. Smoking${i.smoking ? ' is allowed outside only, away from doors and windows' : ' (including vaping and marijuana) is not allowed anywhere on the Property'}.`] },
    {
      title: '11. Repairs and maintenance',
      paragraphs: [
        'Landlord keeps the Property safe, habitable and in good repair, including heating, plumbing, electrical systems and appliances Landlord provides.',
        'Tenant keeps the Property clean, uses it carefully, and reports needed repairs promptly through Prophandld (or in writing). Tenant pays for damage caused by Tenant, occupants or guests beyond normal wear and tear. Tenant will not make alterations, paint or change locks without Landlord\'s written consent.',
        'In an emergency (fire, flood, gas smell, no heat in winter), Tenant should call 911 or the utility first if there is any danger, then report it in Prophandld as an emergency.',
      ],
    },
    { title: '12. Entry', paragraphs: ['Landlord or its contractors may enter at reasonable times to inspect, repair or show the Property, after giving at least 24 hours\' notice, which may be given through Prophandld. In an emergency, Landlord may enter without notice.'] },
    { title: '13. Moving out', paragraphs: ['At move-out, Tenant returns all keys, removes personal property, and leaves the Property clean and in the same condition as at move-in, except for normal wear and tear. If Tenant stays after the Lease ends without Landlord\'s written agreement, Tenant owes rent for each day of holdover.'] },
    { title: '14. Notices', paragraphs: [`Notices under this Lease must be in writing. Notice through Prophandld's messages is written notice where the law allows. Landlord's address for notices: ${i.agentName ? `${i.agentName}, as agent for ${i.landlordName}` : i.landlordName}, through Prophandld or at an address Landlord gives in writing. Any notice the law requires in a particular form (such as a notice to quit) will be given as the law requires.`] },
  ]

  if (extra.length) {
    sections.push({ title: '15. Additional terms', paragraphs: extra.map((c) => `${c.title}. ${c.text}`) })
  }
  const disclosures: string[] = []
  if (i.builtBefore1978 !== 'no') {
    disclosures.push('Lead-based paint: the Property was or may have been built before 1978. Landlord has given Tenant the federal Disclosure of Information on Lead-Based Paint and/or Lead-Based Paint Hazards and the EPA pamphlet "Protect Your Family From Lead in Your Home", which are attached and signed.')
  }
  if (i.inPhiladelphia) {
    disclosures.push('Philadelphia: Landlord has given Tenant a Certificate of Rental Suitability and the "Partners for Good Housing" handbook, and holds a current rental license for the Property.')
  }
  disclosures.push('Fair housing: Landlord does not discriminate on the basis of any characteristic protected by federal, state or local law.')
  sections.push({ title: `${extra.length ? 16 : 15}. Disclosures`, paragraphs: disclosures })
  sections.push({
    title: `${extra.length ? 17 : 16}. Whole agreement`,
    paragraphs: ['This Lease (with any attached disclosures and addenda) is the whole agreement. Changes must be in writing and signed by both sides. If any part is found unenforceable, the rest still applies. Pennsylvania law governs this Lease.'],
  })
  return sections
}
