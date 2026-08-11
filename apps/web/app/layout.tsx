import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { rootStyle } from "@matchread/tokens";
import { getLocale } from "@/lib/i18n";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MatchRead",
  description:
    "Tennis bracket leagues for groups. Fill brackets together. Come back for the Daily Check.",
};

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

const UNREGISTER_SW = `
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  });
  if ("caches" in window) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) { caches.delete(k); });
    });
  }
}
`.trim();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getLocale();

  return (
    <html
      lang={locale}
      className={`${archivo.variable} ${instrumentSans.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: rootStyle() }} />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: UNREGISTER_SW }} />
        {children}
      </body>
    </html>
  );
}
