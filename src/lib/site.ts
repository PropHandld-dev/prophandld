// The one real, canonical domain — used for every link that has to survive
// being emailed out and clicked later (auth redirects, email templates).
// Deliberately never derived from window.location.origin: that reflects
// whatever URL someone happens to be on right now, which is sometimes a
// raw Vercel deployment alias rather than the real domain — and a
// confirmation link built from one of those can land behind Vercel's own
// login wall instead of the app.
export const SITE_URL = 'https://www.prophandld.com'
