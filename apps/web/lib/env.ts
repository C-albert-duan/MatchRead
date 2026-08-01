/**
 * Public env for apps/web.
 * Never read SUPABASE_SERVICE_ROLE_KEY here.
 */

import {
  defaultSiteOrigin,
  normalizeSiteOrigin,
} from "@/lib/site-origin";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env.docker and run docker compose --env-file .env.docker up --build.`
    );
  }
  return value;
}

export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function getSupabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Server-side canonical site origin (invite links, absolute URLs). */
export function getServerSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return normalizeSiteOrigin(explicit);
  if (process.env.VERCEL_URL) {
    return normalizeSiteOrigin(`https://${process.env.VERCEL_URL}`);
  }
  return defaultSiteOrigin();
}

/** @deprecated Prefer getServerSiteUrl — kept for existing imports. */
export function siteUrl(): string {
  return getServerSiteUrl();
}
