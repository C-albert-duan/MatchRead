/** Canonical public origin for metadata / OG. Never a Vercel preview host. */
export function publicSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.matchreadtennis.com";
  return raw.replace(/\/$/, "");
}
