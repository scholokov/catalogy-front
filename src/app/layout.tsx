import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import AppShell from "@/components/nav/AppShell";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import { SnackbarProvider } from "@/components/ui/SnackbarProvider";
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
      { url: "/images/16х16.png", sizes: "16x16", type: "image/png" },
      { url: "/images/32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/images/48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/images/192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/images/32x32.png", sizes: "32x32", type: "image/png" }],
    apple: [
      { url: "/images/180x180.png", sizes: "180x180", type: "image/png" },
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
          <SnackbarProvider>
            <ServiceWorkerRegister />
            <AppShell>{children}</AppShell>
          </SnackbarProvider>
        </Suspense>
      </body>
    </html>
  );
}
