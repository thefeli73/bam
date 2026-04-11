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
  title: "Members List - Bangers and Mash",
  description: "Sign up to the Bangers and Mash members list here to join our parties.",
  appleWebApp: {
    title: "BAM",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth dark">
      <body className={cn("min-h-screen bg-background font-sans antialiased", inter.variable)}>
        <PlausibleProvider
          src="https://plsbl.schulze.network/js/pa-PsVXls0moTgs7mv6uctbO.js"
          enabled={true}
        >
          {children}
        </PlausibleProvider>
      </body>
    </html>
  );
}
