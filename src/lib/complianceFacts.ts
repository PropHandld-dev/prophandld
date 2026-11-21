// Jurisdiction-specific compliance facts, sourced from real documentation
// (not re-derived from the model's own memory), shared between every AI
// route that gives compliance renewal guidance — currently
// compliance-renewal-guide/route.ts and help-chat/route.ts, which used to
// each hardcode their own copy of this exact paragraph. Keeping it in one
// place means the next jurisdiction-specific fact added here reaches both
// routes automatically, instead of risking one getting updated and the
// other quietly going stale.
export const PHILADELPHIA_COMPLIANCE_FACTS =
  'Philadelphia rental licenses are administered by the Department of Licenses & Inspections (L&I). Under the ' +
  'Safe Healthy Homes Act (in effect since November 1, 2026), a cited violation must be fixed within 30 days before a ' +
  'license can be suspended, and a suspended license means rent legally can\'t be collected until it\'s ' +
  'resolved. Name L&I and point to its official site for the current renewal process, since exact portal/fee ' +
  'details change.'

// Reference facts for the questions people actually ask, checked against
// the statutes rather than left to the model's memory. General information,
// not legal advice.
export const RENTAL_LAW_FACTS = `
Pennsylvania (Landlord and Tenant Act of 1951): security deposit max 2 months' rent in the first year of a lease, max 1 month's rent from the start of the second year; after 5 years of tenancy the deposit can't be raised even if rent goes up. Deposits over $100 held more than 2 years must go in an escrow account and the tenant gets interest (minus a 1% fee) from the third year. On move-out the landlord has 30 days to return the deposit with an itemized list of any deductions (the tenant must give a forwarding address in writing); missing that deadline forfeits the right to withhold and can mean double damages. Nonpayment notice to quit: 10 days; for other breaches, 15 days (lease of 1 year or less) or 30 days (longer), unless the lease waives notice. PA has no statewide cap on rent increases or late fees, but late fees must be in the lease and reasonable.
Emergency numbers: 911; PGW gas emergency 215-235-1212; PECO gas/electric emergency 1-800-841-4141; Philadelphia non-emergency city services 311.
Philadelphia: rental license and a Certificate of Rental Suitability are required to collect rent and to evict; tenants get the "Partners for Good Housing" handbook and the City's lead-safe certification where required (pre-1978 buildings). Heat: from October 1 to April 30 landlords who supply heat must keep units at least 68°F from 6:30am to 10:30pm and 64°F overnight; no heat in winter is an emergency, so act the same day: get a heating contractor out immediately, give space heaters or temporary housing if it can't be fixed fast, and keep the tenant updated in writing. Philadelphia's Eviction Diversion Program must be tried before filing an eviction for nonpayment. Good Cause protections apply to leases of 1 year or less. Fair housing: never screen or treat tenants differently by race, color, religion, national origin, sex, disability, familial status, or Philadelphia's added classes (including source of income such as housing vouchers, sexual orientation, gender identity, age, marital status, domestic-violence-survivor status).
`.trim()
