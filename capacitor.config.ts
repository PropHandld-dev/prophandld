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
    url: 'https://www.prophandld.com',
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
