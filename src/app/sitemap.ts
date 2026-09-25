import type { MetadataRoute } from 'next'

// The public pages worth Google indexing — everything else needs a login,
// so there's nothing useful for a search result to link to.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.prophandld.com'
  const now = new Date()
  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
