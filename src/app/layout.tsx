import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import AppShell from "@/components/nav/AppShell";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
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
  title: "Catalogy",
  description: "Catalogy",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/images/icon_192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/icon_512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/images/icon_192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Catalogy",
  },
};

export const viewport: Viewport = {
  themeColor: "#7C3AED",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        suppressHydrationWarning
      >
        <Suspense fallback={null}>
          <ServiceWorkerRegister />
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
