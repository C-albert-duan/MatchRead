/** Client-safe site URL (NEXT_PUBLIC_* only). */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3001";
}
