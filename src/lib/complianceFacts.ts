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
  'Safe Healthy Homes Act (effective November 1, 2026), a cited violation must be fixed within 30 days before a ' +
  'license can be suspended, and a suspended license means rent legally can\'t be collected until it\'s ' +
  'resolved. Name L&I and point to its official site for the current renewal process, since exact portal/fee ' +
  'details change.'
