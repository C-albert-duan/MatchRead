/** Client-safe site URL for magic-link redirects.
 *
 * Prefer `window.location.origin` so Preview / localhost / custom domain match
 * the page the user is on.
 */
import {
  defaultSiteOrigin,
  normalizeSiteOrigin,
} from "@/lib/site-origin";

export function getClientSiteUrl(): string {
  if (typeof window !== "undefined") {
    return normalizeSiteOrigin(window.location.origin);
  }

  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return normalizeSiteOrigin(explicit);

  return defaultSiteOrigin();
}

/** @deprecated Prefer getClientSiteUrl */
export function siteUrl(): string {
  return getClientSiteUrl();
}
