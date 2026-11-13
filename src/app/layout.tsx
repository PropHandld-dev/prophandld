import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import { ViewTransition } from "react";
import { CursorGlow } from "@/components/CursorGlow";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { StagingBadge } from "@/components/StagingBadge";
import { AiHelpBubble } from "@/components/AiHelpBubble";
import { AppLaunchIntro } from "@/components/AppLaunchIntro";
import { LandingLaunchIntro } from "@/components/LandingLaunchIntro";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Headline-only display face for the public marketing pages (home,
// /contractors, /property-managers, /pricing, /philadelphia) -- scoped
// via the .marketing-page h1/h2 rule in globals.css, never touches the
// app dashboards themselves. Syne's geometric weight gives headlines
// actual character instead of the same Geist weight as every button
// and label on the page.
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const SITE_TITLE = "Prophandld: Your Property. Handled.";
const SITE_DESCRIPTION = "Prophandld gives landlords and property managers one place to track every property and tenant, get honest contractor bids through sealed bidding, and collect rent.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.prophandld.com"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  // An external review (2026-11-10) flagged that every page was
  // effectively telling search engines "I am the homepage" — this root
  // metadata (and its openGraph.url below) had no per-page override
  // anywhere, and two pages (/philadelphia, /contractors) had no page
  // metadata at all since they're client components (added layout.tsx
  // wrappers for those). This canonical is this layout's own fallback;
  // every page with its own `metadata` export now sets its own
  // `alternates.canonical` instead of inheriting this one.
  alternates: { canonical: "/" },
  icons: {
    icon: "/icon-192.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // What iPhone uses when the site is added to the Home Screen: launches
  // full-screen under its own name, with a solid status bar so the clock
  // never sits on top of page content.
  appleWebApp: {
    capable: true,
    title: "Prophandld",
    statusBarStyle: "black",
  },
  // Stops iOS turning rent amounts and ID numbers into blue phone links.
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "https://www.prophandld.com",
    siteName: "Prophandld",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Prophandld: Your Property. Handled." }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport = {
  themeColor: "#0C1A2E",
  // Required for env(safe-area-inset-*) to resolve to anything but 0 —
  // BottomTabBar already accounts for the iPhone home-indicator area with
  // it, but without this the whole page renders letterboxed behind the
  // notch/indicator instead of edge-to-edge, and that CSS was silently a
  // no-op. Matters specifically for anyone using this installed as a Home
  // Screen app on a notched device, not in an ordinary browser tab.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppLaunchIntro />
        <LandingLaunchIntro />
        <CursorGlow />
        <ServiceWorkerRegister />
        <ViewTransition>{children}</ViewTransition>
        {/* Floating chat bubble switched off to cut background database load
            (it ran a full inbox query, Realtime subscription and 60s poll on
            every page). Messages tab and job chat pages are unaffected.
            Re-enable by restoring <FloatingChatWidget /> here. */}
        <AiHelpBubble />
        <StagingBadge />
      </body>
    </html>
  );
}
