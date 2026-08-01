/**
 * Canonical public origin for magic-link redirects.
 * Never use 0.0.0.0 — that is a bind address, not a browser URL.
 */

const DEFAULT_SITE = "http://localhost:3001";

const BIND_HOSTS = new Set(["0.0.0.0", "[::]", "::"]);

export function isBindHostname(hostname: string): boolean {
  return BIND_HOSTS.has(hostname.trim().toLowerCase());
}

export function normalizeSiteOrigin(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return DEFAULT_SITE;

  try {
    const u = new URL(trimmed);
    if (isBindHostname(u.hostname)) {
      u.hostname = "localhost";
    }
    return u.origin;
  } catch {
    return DEFAULT_SITE;
  }
}

/** Prefer Host header when present; never return a Docker bind address. */
export function publicOriginFromRequest(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (url.protocol === "https:" ? "https" : "http");
    return normalizeSiteOrigin(`${proto}://${host}`);
  }
  return normalizeSiteOrigin(url.origin);
}

export function defaultSiteOrigin(): string {
  return DEFAULT_SITE;
}
