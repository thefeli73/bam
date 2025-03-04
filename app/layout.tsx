import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import PlausibleProvider from "next-plausible";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const viewport: Viewport = {
  colorScheme: "dark",
};
export const metadata: Metadata = {
  title: "Guest List - Bangers and Mash",
  description: "Sign up to the Bangers and Mash guest list here to join our parties.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth dark">
      <head>
        <PlausibleProvider
          domain="bangersandmashgbg.com"
          customDomain="https://analytics.schulze.network"
          selfHosted={true}
          enabled={true}
        />
      </head>
      <body className={cn("min-h-screen bg-background font-sans antialiased", inter.variable)}>
        {children}
      </body>
    </html>
  );
}
