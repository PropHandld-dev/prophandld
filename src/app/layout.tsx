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

export const metadata: Metadata = {
  title: "Prophandld | Property Management Without the Spreadsheet",
  description: "Prophandld is mini property management for small landlords. Track every property and tenant, get honest contractor bids through sealed bidding, and collect rent, all in one place.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
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
