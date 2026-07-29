import type { CookieOptions } from "@supabase/ssr";

/** Preference cookie — survives the magic-link round trip and later visits. */
export const REMEMBER_COOKIE = "mr_remember";

/** ~13 months — Chrome’s practical persistent-cookie ceiling. */
export const REMEMBER_MAX_AGE_SEC = 60 * 60 * 24 * 400;

/** How long the pre-OTP intent cookie lives (email click must land before this). */
export const REMEMBER_INTENT_MAX_AGE_SEC = 60 * 20;

export function parseRememberFlag(value: string | undefined | null): boolean {
  if (value === "0" || value === "false") return false;
  // Default on: magic-link products should stay signed in until Sign out.
  return true;
}

export function authCookieOptions(remember: boolean): Partial<CookieOptions> {
  return {
    path: "/",
    sameSite: "lax" as const,
    ...(remember ? { maxAge: REMEMBER_MAX_AGE_SEC } : {}),
  };
}

export function mergeCookieOptions(
  options: CookieOptions | undefined,
  remember: boolean
): CookieOptions {
  const base = options ?? {};
  const auth = authCookieOptions(remember);
  if (remember) {
    return { ...base, ...auth, maxAge: REMEMBER_MAX_AGE_SEC };
  }
  // Session cookie: drop maxAge so the browser clears it when the session ends.
  const { maxAge: _ignored, ...rest } = { ...base, ...auth };
  return rest;
}
