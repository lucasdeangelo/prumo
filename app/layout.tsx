import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Prumo — finanças com clareza",
  description: "Uma base segura para organizar suas finanças pessoais.",
  applicationName: "Prumo",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#101917" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={geist.variable}>
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  );
}
