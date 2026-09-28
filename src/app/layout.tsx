import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ViewTransition } from "react";
import { CursorGlow } from "@/components/CursorGlow";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { StagingBadge } from "@/components/StagingBadge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_TITLE = "Prophandld | Property Management Without the Spreadsheet";
const SITE_DESCRIPTION = "Prophandld is mini property management for small landlords. Track every property and tenant, get honest contractor bids through sealed bidding, and collect rent, all in one place.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.prophandld.com"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CursorGlow />
        <ServiceWorkerRegister />
        <ViewTransition>{children}</ViewTransition>
        {/* Floating chat bubble switched off to cut background database load
            (it ran a full inbox query, Realtime subscription and 60s poll on
            every page). Messages tab and job chat pages are unaffected.
            Re-enable by restoring <FloatingChatWidget /> here. */}
        <StagingBadge />
      </body>
    </html>
  );
}
