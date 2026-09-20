// Every state's official contractor-licensing or registration body, taken
// from the state's own site. Used for states where we don't yet list
// per-trade rules (see credentialRequirements.ts), so a contractor anywhere
// still gets a pointer to the right place. `note` is only stated where an
// official source said so; where a state has no statewide license, that's
// the note. Last reviewed: September 2026.

export type StateBoard = {
  state: string
  stateName: string
  board: string
  url?: string
  note?: string
}

export const STATE_BOARDS: Record<string, StateBoard> = {
  AL: { state: 'AL', stateName: 'Alabama', board: 'Alabama Licensing Board for General Contractors', url: 'https://genconbd.alabama.gov/' },
  AK: { state: 'AK', stateName: 'Alaska', board: 'Division of Corporations, Business and Professional Licensing', url: 'https://www.commerce.alaska.gov/web/cbpl/ProfessionalLicensing/ConstructionContractors', note: 'Construction contractors register with the state and must show proof of liability insurance.' },
  AZ: { state: 'AZ', stateName: 'Arizona', board: 'Arizona Registrar of Contractors', url: 'https://roc.az.gov/search' },
  AR: { state: 'AR', stateName: 'Arkansas', board: 'Arkansas Contractors Licensing Board', url: 'https://labor.arkansas.gov/licensing/arkansas-contractors-licensing-board/find-a-licensed-contractor/' },
  CA: { state: 'CA', stateName: 'California', board: 'Contractors State License Board', url: 'https://www.cslb.ca.gov/' },
  CO: { state: 'CO', stateName: 'Colorado', board: 'DORA license lookup (state-licensed plumbers and electricians)', url: 'https://www.colorado.gov/dora/licensing/Lookup/LicenseLookup.aspx', note: 'No state general-contractor license: cities and counties license contractors. Electricians and plumbers are licensed by the state.' },
  CT: { state: 'CT', stateName: 'Connecticut', board: 'Department of Consumer Protection', url: 'https://www.elicense.ct.gov/Lookup/LicenseLookup.aspx' },
  DC: { state: 'DC', stateName: 'District of Columbia', board: 'Department of Licensing and Consumer Protection', url: 'https://dlcp.dc.gov/node/1618836', note: 'Home improvement contractors must hold a DC Home Improvement Contractor license.' },
  DE: { state: 'DE', stateName: 'Delaware', board: 'Division of Professional Regulation and Department of Labor' },
  FL: { state: 'FL', stateName: 'Florida', board: 'DBPR Construction Industry Licensing Board', url: 'https://www2.myfloridalicense.com/construction-industry/' },
  GA: { state: 'GA', stateName: 'Georgia', board: 'State Licensing Board for Residential and General Contractors', url: 'https://sos.ga.gov/state-licensing-board-residential-and-commercial-general-contractors' },
  HI: { state: 'HI', stateName: 'Hawaii', board: 'Contractors License Board (DCCA)', url: 'https://cca.hawaii.gov/pvl/boards/contractor/', note: 'Anyone doing construction work for pay needs a license from the Contractors License Board.' },
  ID: { state: 'ID', stateName: 'Idaho', board: 'Idaho Contractors Board (DOPL)', url: 'https://dopl.idaho.gov/con/', note: 'Contractors register with the state; there is no trade exam.' },
  IL: { state: 'IL', stateName: 'Illinois', board: 'IDFPR license lookup', url: 'https://idfpr.illinois.gov/checklicense.html', note: 'No state general-contractor license, but the state licenses roofing contractors and plumbers. Chicago licenses trades separately.' },
  IN: { state: 'IN', stateName: 'Indiana', board: 'Indiana Professional Licensing Agency', url: 'https://mylicense.in.gov/', note: 'Plumbers are licensed by the state.' },
  IA: { state: 'IA', stateName: 'Iowa', board: 'Iowa Division of Labor, Contractor Registration', url: 'https://www.idol.iowa.gov/contractor-registration', note: 'Construction contractors register with the state once they earn $2,000 or more a year from construction.' },
  KS: { state: 'KS', stateName: 'Kansas', board: 'Local city or county building department', note: 'Kansas generally has no statewide contractor, plumber or electrician license. Cities and counties license them.' },
  KY: { state: 'KY', stateName: 'Kentucky', board: 'Department of Housing, Buildings and Construction', url: 'https://dhbc.ky.gov/', note: 'The state licenses plumbers, electricians and HVAC contractors.' },
  LA: { state: 'LA', stateName: 'Louisiana', board: 'State Licensing Board for Contractors', url: 'https://lslbc.gov/contractor-search/' },
  ME: { state: 'ME', stateName: 'Maine', board: 'Office of Professional and Occupational Regulation', note: 'No statewide general-contractor license. Plumbers and electricians are licensed by the state; other requirements are local.' },
  MD: { state: 'MD', stateName: 'Maryland', board: 'Maryland Department of Labor (licensing queries)', url: 'https://labor.maryland.gov/pq/' },
  MA: { state: 'MA', stateName: 'Massachusetts', board: 'Office of Consumer Affairs and Business Regulation', url: 'https://contractorhub.mass.gov/s/hic-contractor-search' },
  MI: { state: 'MI', stateName: 'Michigan', board: 'LARA Bureau of Construction Codes', url: 'https://aca-prod.accela.com/LARA', note: 'Residential builders and maintenance & alteration contractors (roofing, siding, painting and similar) are state licensed.' },
  MN: { state: 'MN', stateName: 'Minnesota', board: 'Department of Labor and Industry', url: 'https://www.dli.mn.gov/license-and-registration-lookup' },
  MS: { state: 'MS', stateName: 'Mississippi', board: 'Mississippi State Board of Contractors', url: 'https://www.msboc.us/' },
  MO: { state: 'MO', stateName: 'Missouri', board: 'Local city or county building department', note: 'No statewide general-contractor, plumbing or HVAC license. Cities and counties license them; a statewide electrical contractor license is optional.' },
  MT: { state: 'MT', stateName: 'Montana', board: 'Department of Labor and Industry', url: 'https://erdcontractors.mt.gov/ICCROnlineSearch/searchform', note: 'Contractor registration is a workers’ compensation compliance registration, not a skills license.' },
  NE: { state: 'NE', stateName: 'Nebraska', board: 'Department of Labor, Contractor Registration', url: 'https://dol.nebraska.gov/conreg/Search', note: 'Contractors register with the state; those with employees show workers’ compensation coverage.' },
  NV: { state: 'NV', stateName: 'Nevada', board: 'Nevada State Contractors Board', url: 'https://app.nvcontractorsboard.com/Clients/NVSCB/Public/ContractorLicenseSearch/ContractorLicenseSearch.aspx' },
  NH: { state: 'NH', stateName: 'New Hampshire', board: 'Office of Professional Licensure and Certification', url: 'https://oplc.nh.gov/', note: 'No general-contractor license. Electricians and plumbers are state licensed.' },
  NJ: { state: 'NJ', stateName: 'New Jersey', board: 'NJ Division of Consumer Affairs', url: 'https://newjersey.mylicense.com/verification/' },
  NM: { state: 'NM', stateName: 'New Mexico', board: 'Construction Industries Division (RLD)', url: 'https://www.rld.nm.gov/construction-industries/' },
  NY: { state: 'NY', stateName: 'New York', board: 'NYC Department of Consumer and Worker Protection', url: 'https://www.nyc.gov/site/dca/consumers/check-license.page', note: 'No statewide contractor license. New York City requires a DCWP license for home improvement work over $200, and several counties (Nassau, Suffolk, Westchester, Rockland, Putnam, Albany) run their own registries.' },
  NC: { state: 'NC', stateName: 'North Carolina', board: 'Licensing Board for General Contractors', url: 'https://nclbgc.org/license-search/' },
  ND: { state: 'ND', stateName: 'North Dakota', board: 'Secretary of State, contractor registration', url: 'https://firststop.sos.nd.gov/search' },
  OH: { state: 'OH', stateName: 'Ohio', board: 'Ohio Construction Industry Licensing Board', url: 'https://elicense4.com.ohio.gov/lookup/licenselookup.aspx', note: 'The state board licenses electrical, HVAC, hydronics, plumbing and refrigeration contractors.' },
  OK: { state: 'OK', stateName: 'Oklahoma', board: 'Construction Industries Board', url: 'https://cibverify.ok.gov/', note: 'The state licenses electrical, mechanical and plumbing trades.' },
  OR: { state: 'OR', stateName: 'Oregon', board: 'Construction Contractors Board', url: 'https://search.ccb.state.or.us/search/', note: 'Generally anyone doing construction on real property for pay must be licensed.' },
  PA: { state: 'PA', stateName: 'Pennsylvania', board: 'PA Attorney General, Home Improvement Contractor registry', url: 'https://hicsearch.attorneygeneral.gov/' },
  RI: { state: 'RI', stateName: 'Rhode Island', board: 'Contractors’ Registration and Licensing Board', url: 'https://crb.ri.gov/search/contractor-search' },
  SC: { state: 'SC', stateName: 'South Carolina', board: 'Contractors’ Licensing Board (LLR)', url: 'https://llr.sc.gov/clb/', note: 'Residential builders and specialty contractors are licensed by the separate Residential Builders Commission.' },
  SD: { state: 'SD', stateName: 'South Dakota', board: 'Department of Labor and Regulation', url: 'https://dlr.sd.gov/plumbing/licensing.aspx', note: 'No state general-contractor license, but electrical and plumbing work require state licenses.' },
  TN: { state: 'TN', stateName: 'Tennessee', board: 'Board for Licensing Contractors', url: 'https://www.tn.gov/commerce/regboards/contractors.html' },
  TX: { state: 'TX', stateName: 'Texas', board: 'Texas Department of Licensing and Regulation', url: 'https://www.tdlr.texas.gov/verify.htm', note: 'Texas does not license general contractors. TDLR licenses electricians and air-conditioning contractors; plumbers are licensed by the Texas State Board of Plumbing Examiners.' },
  UT: { state: 'UT', stateName: 'Utah', board: 'Division of Occupational and Professional Licensing', url: 'https://commerce.utah.gov/dopl/licenses/' },
  VT: { state: 'VT', stateName: 'Vermont', board: 'Division of Fire Safety (electricians and plumbers)', url: 'https://firesafety.vermont.gov/licensing', note: 'No state general-contractor license. Electricians and plumbers are licensed by the state.' },
  VA: { state: 'VA', stateName: 'Virginia', board: 'DPOR Board for Contractors', url: 'https://www.dpor.virginia.gov/LicenseLookup' },
  WA: { state: 'WA', stateName: 'Washington', board: 'Department of Labor & Industries', url: 'https://secure.lni.wa.gov/verify/', note: 'Contractors register with L&I, which includes a bond, liability insurance and workers’ compensation coverage.' },
  WV: { state: 'WV', stateName: 'West Virginia', board: 'Contractor Licensing Board', url: 'https://wvclboard.wv.gov/verify/' },
  WI: { state: 'WI', stateName: 'Wisconsin', board: 'Department of Safety and Professional Services', url: 'https://licensesearch.wi.gov/' },
  WY: { state: 'WY', stateName: 'Wyoming', board: 'Local city or county building department', note: 'Wyoming leaves most contractor licensing to cities and counties. Electrical work is licensed by the state.' },
}
