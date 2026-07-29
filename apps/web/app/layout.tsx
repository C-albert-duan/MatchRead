import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MatchRead",
  description:
    "Tennis bracket leagues for groups. Fill brackets together. Come back for the Daily Check.",
};

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
  return (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: UNREGISTER_SW }} />
        {children}
      </body>
    </html>
  );
}
