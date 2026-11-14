import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { HIDE_VALUES_BOOT } from "@/lib/hide-values";

import "./globals.css";

// Design system: Geist for interface and text (400/500/600; 700 only in the wordmark), Geist Mono for labels and dates.
const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Prumo — finanças com clareza",
  description: "Finanças a dois, no prumo.",
  applicationName: "Prumo",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f6f3",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the inline script may add data-hide-values before React hydrates.
    <html lang="pt-BR" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HIDE_VALUES_BOOT }} />
      </head>
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  );
}
