/**
 * Accepts relative in-app paths by shape. Malformed → fallback or "/".
 * Never use a blocklist — safeNext rejects by shape only.
 *
 * Browsers and the WHATWG URL parser strip tab, CR and LF from URLs, so
 * "/\t/evil.com" would become "//evil.com" (another host) once redirected
 * (fix list P0-6). Control characters are therefore refused, and the result
 * is resolved against a placeholder origin and must stay on it.
 */
const PLACEHOLDER_ORIGIN = "https://matchread.invalid";

export function safeNext(
  raw: string | null | undefined,
  fallback = "/leagues"
): string {
  if (!raw || typeof raw !== "string") return fallback;
  const next = raw.trim();
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  if (next.includes("://")) return "/";
  if (next.includes("\\")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  let resolved: URL;
  try {
    resolved = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return "/";
  }
  if (resolved.origin !== PLACEHOLDER_ORIGIN) return "/";
  // Dot segments can collapse to "//host" ("/..//evil.com"), which a
  // redirect would read as protocol-relative.
  if (resolved.pathname.startsWith("//")) return "/";
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
