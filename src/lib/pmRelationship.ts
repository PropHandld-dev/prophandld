// One plain-language summary of a PM <-> owner relationship, shown at the
// top of the PM's client card and the owner's "Managed by" card, so both
// sides read the same rules the same way. PM pages are English-only (they
// use the Google Translate toggle), so this is English.

type Rel = {
  ownerName: string
  orgName?: string
  propertyCount?: number | null
  approvalThreshold: number
  rentRecipient?: 'owner' | 'pm'
  managementFee: number | null
  managementFeeFrequency: 'one_time' | 'monthly' | null
  managementFeeType: 'flat' | 'percent_of_rent'
  managementFeePercent: number | null
  feeApproved: boolean
}

const usd = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })

function feeText(r: Rel) {
  if (r.managementFeeType === 'percent_of_rent' && r.managementFeePercent) return `${r.managementFeePercent}% of rent collected`
  if (r.managementFee) return `${usd(r.managementFee)}${r.managementFeeFrequency === 'monthly' ? ' a month' : ' one time'}`
  return null
}

export function relationshipSentences(view: 'pm' | 'owner', r: Rel): string[] {
  const owner = view === 'pm' ? r.ownerName : 'you'
  const props = r.propertyCount != null ? `${r.propertyCount} ${r.propertyCount === 1 ? 'property' : 'properties'}` : 'the properties'
  const out: string[] = []
  out.push(view === 'pm' ? `You manage ${props} for ${r.ownerName}.` : `${r.orgName || 'Your property manager'} manages ${props} for you.`)
  out.push(
    r.approvalThreshold > 0
      ? `Repairs over ${usd(r.approvalThreshold)} need ${view === 'pm' ? `${r.ownerName}'s` : 'your'} approval; smaller ones ${view === 'pm' ? 'you can approve' : 'they approve'} directly.`
      : `Every repair needs ${view === 'pm' ? `${r.ownerName}'s` : 'your'} approval.`,
  )
  out.push(r.rentRecipient === 'pm' ? `Rent goes to ${view === 'pm' ? 'your company' : r.orgName || 'your manager'}, then to ${owner}.` : `Rent goes directly to ${owner}.`)
  const fee = feeText(r)
  if (fee) out.push(`Management fee: ${fee}${r.feeApproved ? '.' : view === 'pm' ? `, waiting for ${r.ownerName} to approve it.` : ', waiting for your approval. Nothing is charged until you approve.'}`)
  else out.push('No management fee is set.')
  return out
}
