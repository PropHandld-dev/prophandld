// Vercel sets VERCEL_ENV to 'production', 'preview' or 'development'.
// Preview deployments (the staging site) must never contact real people.
export function isPreviewDeployment() {
  return process.env.VERCEL_ENV === 'preview'
}
