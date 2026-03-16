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
      {
        url: "/images/16х16.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/images/16x16_light.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
    ],
    shortcut: [
      {
        url: "/images/16х16.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/images/16x16_light.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
    ],
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
