import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { rootStyle } from "@matchread/tokens";
import { ErrorReporter } from "@/components/shell/ErrorReporter";
import { TelemetryRoot } from "@/components/shell/Telemetry";
import { getLocale } from "@/lib/i18n";
import { publicPageMetadata } from "@/lib/seo";
import "./globals.css";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#E8F1EB",
};

export const metadata: Metadata = publicPageMetadata({
  title: "MatchRead",
  path: "/",
});

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
        <ErrorReporter />
        <TelemetryRoot />
        {children}
      </body>
    </html>
  );
}
