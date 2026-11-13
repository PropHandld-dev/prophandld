import type { SupabaseClient } from '@supabase/supabase-js'

// Turns "Property Fix LLC" into "property-fix-llc" -- the public profile
// URL segment (/property-managers/[slug]), generated once when an admin
// first turns on "open to new clients" rather than asked for up front,
// so nobody has to think about URL slugs just to create an organization.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'company'
}

export async function ensureOrgSlug(admin: SupabaseClient, organizationId: string, orgName: string): Promise<string> {
  const { data: existing } = await admin.from('pm_organizations').select('slug').eq('id', organizationId).maybeSingle()
  if (existing?.slug) return existing.slug

  const base = slugify(orgName)
  let candidate = base
  // Collision check: append -2, -3, ... rather than a random suffix, so
  // the first company with a given name keeps the clean URL and only a
  // genuine duplicate name gets a number.
  for (let i = 2; i < 50; i++) {
    const { data: taken } = await admin.from('pm_organizations').select('id').eq('slug', candidate).maybeSingle()
    if (!taken) break
    candidate = `${base}-${i}`
  }

  await admin.from('pm_organizations').update({ slug: candidate }).eq('id', organizationId)
  return candidate
}
