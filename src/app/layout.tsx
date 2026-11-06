import type { Metadata, Viewport } from "next";
import { t } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: t.brand, template: `%s | ${t.brand}` },
  description: t.landing.subtitle,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
