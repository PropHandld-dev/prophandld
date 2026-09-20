// What licenses, registrations and insurance a contractor is expected to
// hold, by trade and by where they work. Only rules confirmed against
// official sources are listed with specifics; anything else is deliberately
// general. Rules change, so every entry links to where it's verified and the
// UI tells people to confirm with the issuing agency.
//
// Last reviewed: September 2026. Covered: federal, PA (incl. Philadelphia),
// NJ, DE. Other states get the federal + insurance items and a prompt to
// check their state licensing board.

export type RequirementLevel = 'required' | 'conditional' | 'recommended'

export type Requirement = {
  id: string
  name: string
  level: RequirementLevel
  // Trade categories it applies to; 'all' matches every trade, including
  // custom "Other" ones.
  appliesTo: string[] | 'all'
  issuer: string
  summary: string
  // Something a landlord/admin can open to check it's real. Not every
  // credential has a public search, so this is optional.
  lookupUrl?: string
  lookupLabel?: string
  infoUrl?: string
  // False when there's no expiry date to track (e.g. EPA 608 never expires).
  hasExpiry?: boolean
  // Short label for landlord-facing badges.
  badge: string
}

export const LICENSE_TRADES = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  appliance: 'Appliance',
  structural: 'Structural',
  pest: 'Pest',
  turnover: 'Turnover',
} as const

const T = LICENSE_TRADES
const HOME_IMPROVEMENT_TRADES = [T.plumbing, T.electrical, T.hvac, T.structural, T.turnover]

export const REQUIREMENTS: Record<string, Requirement> = {
  liability_insurance: {
    id: 'liability_insurance',
    name: 'General liability insurance',
    level: 'recommended',
    appliesTo: 'all',
    issuer: 'Your insurance company',
    summary: 'Certificate of insurance showing general liability coverage. Landlords look for this before picking a bid, and some states set a minimum (see your state registration below).',
    badge: 'Insured',
  },
  workers_comp: {
    id: 'workers_comp',
    name: "Workers' compensation insurance",
    level: 'conditional',
    appliesTo: 'all',
    issuer: 'Your insurance company',
    summary: 'Needed if you have employees. Some states require proof of it for registration (see NJ and DE).',
    badge: "Workers' comp",
  },

  federal_epa_rrp: {
    id: 'federal_epa_rrp',
    name: 'EPA Lead-Safe (RRP) firm certification',
    level: 'conditional',
    appliesTo: [T.structural, T.turnover],
    issuer: 'U.S. EPA',
    summary: 'Required for anyone paid to do work that disturbs painted surfaces in homes built before 1978, including rentals. Applies to other trades too if their work disturbs paint.',
    lookupUrl: 'https://cdxocsppapps.epa.gov/ocspp-oppt-lead/firm-location-search',
    lookupLabel: 'EPA certified-firm search',
    infoUrl: 'https://www.epa.gov/lead/renovation-repair-and-painting-program',
    badge: 'Lead-safe certified',
  },
  federal_epa_608: {
    id: 'federal_epa_608',
    name: 'EPA Section 608 refrigerant certification',
    level: 'conditional',
    appliesTo: [T.hvac, T.appliance],
    issuer: 'EPA-approved testing organization',
    summary: 'Required to service equipment that contains refrigerant. Types I (small appliances), II, III, or Universal. It does not expire and there is no public search, so it is verified from the card.',
    infoUrl: 'https://www.epa.gov/section608/section-608-technician-certification',
    hasExpiry: false,
    badge: 'EPA 608',
  },

  state_pesticide_license: {
    id: 'state_pesticide_license',
    name: 'State pesticide applicator / business license',
    level: 'required',
    appliesTo: [T.pest],
    issuer: 'Your state agriculture or environmental agency',
    summary: 'Applying pesticides on someone else’s property requires a state-certified applicator. Check your state agency for the exact license.',
    badge: 'Pesticide licensed',
  },

  // ---- Pennsylvania ----
  pa_hic: {
    id: 'pa_hic',
    name: 'PA Home Improvement Contractor registration',
    level: 'conditional',
    appliesTo: HOME_IMPROVEMENT_TRADES,
    issuer: 'PA Attorney General, Bureau of Consumer Protection',
    summary: 'Required for contractors doing $5,000 or more of home improvement work a year. Registration requires at least $50,000 personal injury and $50,000 property damage liability coverage. It is a consumer-protection registration: it does not test skills or license a trade.',
    lookupUrl: 'https://hicsearch.attorneygeneral.gov/',
    lookupLabel: 'PA HIC registration search',
    infoUrl: 'https://www.attorneygeneral.gov/resources/home-improvement-contractor-registration/contractor-frequently-asked-questions/',
    badge: 'PA HIC registered',
  },
  pa_pesticide_business: {
    id: 'pa_pesticide_business',
    name: 'PA pesticide business license + certified applicator',
    level: 'required',
    appliesTo: [T.pest],
    issuer: 'PA Department of Agriculture',
    summary: 'The business needs a pesticide application business license with at least one certified applicator, and proof of insurance that lists the PA Department of Agriculture as certificate holder.',
    infoUrl: 'https://www.pa.gov/agencies/pda/plants-land-water/plant-industry/pesticide-programs/pesticide-application-businesses',
    badge: 'PA pesticide licensed',
  },
  phl_commercial_activity: {
    id: 'phl_commercial_activity',
    name: 'Philadelphia Commercial Activity License',
    level: 'conditional',
    appliesTo: 'all',
    issuer: 'City of Philadelphia',
    summary: 'Many Philadelphia trade licenses also require a Commercial Activity License.',
    lookupUrl: 'https://li.phila.gov/contractor-lookup',
    lookupLabel: 'Philadelphia L&I lookup',
    badge: 'Philadelphia CAL',
  },
  phl_electrical: {
    id: 'phl_electrical',
    name: 'Philadelphia Electrical Contractor license',
    level: 'required',
    appliesTo: [T.electrical],
    issuer: 'Philadelphia Dept. of Licenses & Inspections',
    summary: 'Electrical work in Philadelphia requires a city Electrical Contractor license (plus a Commercial Activity License).',
    lookupUrl: 'https://li.phila.gov/contractor-lookup',
    lookupLabel: 'Philadelphia L&I lookup',
    infoUrl: 'https://www.phila.gov/departments/department-of-licenses-and-inspections/licenses/trade-licenses/',
    badge: 'Philadelphia electrician',
  },
  phl_plumbing: {
    id: 'phl_plumbing',
    name: 'Philadelphia Master Plumber license',
    level: 'required',
    appliesTo: [T.plumbing],
    issuer: 'Philadelphia Dept. of Licenses & Inspections',
    summary: 'Plumbing in Philadelphia is licensed by the city: Master Plumber, Journeyman and Apprentice.',
    lookupUrl: 'https://li.phila.gov/contractor-lookup',
    lookupLabel: 'Philadelphia L&I lookup',
    infoUrl: 'https://www.phila.gov/departments/department-of-licenses-and-inspections/licenses/trade-licenses/',
    badge: 'Philadelphia plumber',
  },
  phl_contractor: {
    id: 'phl_contractor',
    name: 'Philadelphia Contractor license',
    level: 'conditional',
    appliesTo: [T.structural, T.turnover],
    issuer: 'Philadelphia Dept. of Licenses & Inspections',
    summary: 'The city issues a Contractor license (and separate ones for demolition and excavation). Whether it applies depends on the scope of the work, so confirm with L&I.',
    lookupUrl: 'https://li.phila.gov/contractor-lookup',
    lookupLabel: 'Philadelphia L&I lookup',
    infoUrl: 'https://www.phila.gov/departments/department-of-licenses-and-inspections/licenses/trade-licenses/',
    badge: 'Philadelphia contractor',
  },

  // ---- New Jersey ----
  nj_hic: {
    id: 'nj_hic',
    name: 'NJ Home Improvement Contractor registration',
    level: 'required',
    appliesTo: HOME_IMPROVEMENT_TRADES,
    issuer: 'NJ Division of Consumer Affairs',
    summary: 'Issued to the business (a number starting 13VH), renewed every two years. Requires at least $500,000 commercial general liability per occurrence, plus workers’ compensation unless exempt. Search under Business Search, not by the owner’s name.',
    lookupUrl: 'https://newjersey.mylicense.com/verification/',
    lookupLabel: 'NJ license verification',
    badge: 'NJ HIC registered',
  },
  nj_master_plumber: {
    id: 'nj_master_plumber',
    name: 'NJ Master Plumber license',
    level: 'required',
    appliesTo: [T.plumbing],
    issuer: 'NJ Division of Consumer Affairs',
    summary: 'Plumbing is a state-licensed trade in New Jersey, on top of the business registration. Search under Person Search.',
    lookupUrl: 'https://newjersey.mylicense.com/verification/',
    lookupLabel: 'NJ license verification',
    badge: 'NJ master plumber',
  },
  nj_electrical: {
    id: 'nj_electrical',
    name: 'NJ Electrical Contractor business license',
    level: 'required',
    appliesTo: [T.electrical],
    issuer: 'NJ Division of Consumer Affairs',
    summary: 'Electrical contracting is state-licensed in New Jersey. Search under Business Search for the contractor business.',
    lookupUrl: 'https://newjersey.mylicense.com/verification/',
    lookupLabel: 'NJ license verification',
    badge: 'NJ electrical contractor',
  },
  nj_hvacr: {
    id: 'nj_hvacr',
    name: 'NJ Master HVACR Contractor license',
    level: 'required',
    appliesTo: [T.hvac],
    issuer: 'NJ Division of Consumer Affairs',
    summary: 'HVAC and refrigeration contracting is state-licensed in New Jersey. Search under Person Search.',
    lookupUrl: 'https://newjersey.mylicense.com/verification/',
    lookupLabel: 'NJ license verification',
    badge: 'NJ master HVACR',
  },

  // ---- Delaware ----
  de_contractor_registration: {
    id: 'de_contractor_registration',
    name: 'Delaware Contractor Registration Certificate',
    level: 'conditional',
    appliesTo: HOME_IMPROVEMENT_TRADES,
    issuer: 'Delaware Department of Labor',
    summary: 'Contractors doing construction or maintenance work in Delaware must register before working. Registration requires proof of Delaware workers’ compensation insurance and an OSHA-compliant safety plan.',
    infoUrl: 'https://labor.delaware.gov/divisions/industrial-affairs/labor-law/contractor-registration-act',
    badge: 'DE registered contractor',
  },
  de_business_license: {
    id: 'de_business_license',
    name: 'Delaware business license',
    level: 'required',
    appliesTo: 'all',
    issuer: 'Delaware Division of Revenue',
    summary: 'Anyone doing business in Delaware needs a business license from the Division of Revenue.',
    lookupUrl: 'https://revenue.delaware.gov/business-license-search/',
    lookupLabel: 'Delaware business license search',
    badge: 'DE business licensed',
  },
  de_electrical: {
    id: 'de_electrical',
    name: 'Delaware electrician license',
    level: 'required',
    appliesTo: [T.electrical],
    issuer: 'Delaware Division of Professional Regulation',
    summary: 'Electrical work requires a state license (Master, Journeyperson, Residential and others). Contact the Division of Professional Regulation at 1-302-744-4504 to verify.',
    badge: 'DE electrician',
  },
  de_plumbing: {
    id: 'de_plumbing',
    name: 'Delaware Master Plumber license',
    level: 'required',
    appliesTo: [T.plumbing],
    issuer: 'Delaware Division of Professional Regulation',
    summary: 'Plumbing requires a state license. Contact the Division of Professional Regulation at 1-302-744-4504 to verify.',
    badge: 'DE plumber',
  },
  de_hvacr: {
    id: 'de_hvacr',
    name: 'Delaware Master HVACR license',
    level: 'required',
    appliesTo: [T.hvac],
    issuer: 'Delaware Division of Professional Regulation',
    summary: 'HVACR work requires a state license. Contact the Division of Professional Regulation at 1-302-744-4504 to verify.',
    badge: 'DE HVACR',
  },
}

// Carried over from the old single-license form so nothing a contractor
// already submitted is lost.
export const LEGACY_LICENSE: Requirement = {
  id: 'legacy_license',
  name: 'License on file',
  level: 'recommended',
  appliesTo: 'all',
  issuer: 'Issuing agency',
  summary: 'A license submitted before requirements were split by trade and state.',
  badge: 'Licensed',
}

const STATE_REQUIREMENTS: Record<string, string[]> = {
  PA: ['pa_hic', 'pa_pesticide_business'],
  NJ: ['nj_hic', 'nj_master_plumber', 'nj_electrical', 'nj_hvacr', 'state_pesticide_license'],
  DE: ['de_contractor_registration', 'de_business_license', 'de_electrical', 'de_plumbing', 'de_hvacr', 'state_pesticide_license'],
}

const CITY_REQUIREMENTS: Record<string, string[]> = {
  'PA:philadelphia': ['phl_commercial_activity', 'phl_electrical', 'phl_plumbing', 'phl_contractor'],
}

const BASE = ['liability_insurance', 'workers_comp', 'federal_epa_rrp', 'federal_epa_608']

export const SUPPORTED_STATES = Object.keys(STATE_REQUIREMENTS)

export function requirementById(id: string): Requirement | undefined {
  if (id === LEGACY_LICENSE.id) return LEGACY_LICENSE
  return REQUIREMENTS[id]
}

export function requirementsFor({
  state,
  city,
  categories,
}: {
  state: string | null
  city: string | null
  categories: string[]
}): { requirements: Requirement[]; coverage: 'full' | 'federal_only' } {
  const ids = [...BASE]
  let coverage: 'full' | 'federal_only' = 'federal_only'

  if (state && STATE_REQUIREMENTS[state]) {
    coverage = 'full'
    ids.push(...STATE_REQUIREMENTS[state])
    if (city) ids.push(...(CITY_REQUIREMENTS[`${state}:${city.toLowerCase()}`] || []))
  } else {
    ids.push('state_pesticide_license')
  }

  const requirements = Array.from(new Set(ids))
    .map((id) => REQUIREMENTS[id])
    .filter((r): r is Requirement => !!r)
    .filter((r) => r.appliesTo === 'all' || r.appliesTo.some((t) => categories.includes(t)))

  return { requirements, coverage }
}
