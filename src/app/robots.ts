import type { MetadataRoute } from 'next'

// Tells search engines what to crawl. Everything under /api, and every
// signed-in page (landlord/renter/contractor/admin dashboards), is either
// useless to a search result or behind a login wall, so there's no reason
// to have Google spend time on it — only the public marketing pages should
// ever show up in a search result.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/signup', '/terms', '/privacy'],
      disallow: ['/api/', '/landlord/', '/renter/', '/contractor/', '/admin/', '/receipts/', '/profile'],
    },
    sitemap: 'https://www.prophandld.com/sitemap.xml',
  }
}
