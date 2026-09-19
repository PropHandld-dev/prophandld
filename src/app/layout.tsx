import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ViewTransition } from "react";
import { CursorGlow } from "@/components/CursorGlow";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { FloatingChatWidget } from "@/components/FloatingChatWidget";
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
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "https://prophandld.com",
    siteName: "Prophandld",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Prophandld — Your Property. Handled." }],
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
        <FloatingChatWidget />
      </body>
    </html>
  );
}
