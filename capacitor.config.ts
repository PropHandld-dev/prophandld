import type { CapacitorConfig } from '@capacitor/cli'

// Prophandld is a full server-rendered Next.js app (API routes, auth,
// Stripe, Supabase), not a static site — there's no "build output" that
// could be bundled into the native app the way a static SPA would be.
// Instead, both native apps are a thin WebView wrapper that loads the live
// production site directly (the standard pattern for wrapping an existing
// server-backed web app — effectively the same thing a Trusted Web
// Activity does on Android, done here via Capacitor so iOS gets the same
// treatment). The actual app logic, auth, and data all keep running on
// www.prophandld.com exactly as they do today; nothing here duplicates or
// forks that.
const config: CapacitorConfig = {
  appId: 'com.prophandld.app',
  appName: 'Prophandld',
  webDir: 'public',
  server: {
    // Native app opens straight to sign-in, not the marketing homepage —
    // someone who already installed the app from the App/Play Store
    // already made the "try this" decision (that's what the store
    // listing and website are for); showing the full pitch again inside
    // the app itself is redundant friction every major native app
    // (banking, Uber, Airbnb) deliberately avoids. /login itself handles
    // both directions correctly: a visible "Sign up" link for a new
    // user, and an automatic redirect straight to the right dashboard
    // for anyone already signed in — so this is safe for first-time and
    // returning users alike. The website at www.prophandld.com in a
    // regular browser is untouched — it still opens on the full landing
    // page, which is exactly right for a visitor who hasn't decided yet.
    url: 'https://www.prophandld.com/login',
    // Required by Capacitor's WebView to actually navigate to a remote
    // origin rather than only ever loading local files.
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    // Auto-hides itself after launchShowDuration — no native-aware JS needed
    // in the web app itself (it stays a plain Next.js site with zero
    // Capacitor-specific code; see this file's own top comment for why).
    // Covers the real network wait for www.prophandld.com to load on first
    // launch with the app's own branded screen instead of a blank/white
    // WebView flash.
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0C1A2E',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
}

export default config
