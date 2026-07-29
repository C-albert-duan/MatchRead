"use client";

import {
  REMEMBER_COOKIE,
  REMEMBER_INTENT_MAX_AGE_SEC,
  REMEMBER_MAX_AGE_SEC,
} from "@/lib/auth/remember";

const STORAGE_KEY = "mr_remember_pref";

export function getRememberPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    // ignore
  }
  return true;
}

export function setRememberPref(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, remember ? "1" : "0");
  } catch {
    // ignore
  }
  // Short-lived intent for the magic-link round trip (must exist when /auth/callback runs)
  const maxAge = REMEMBER_INTENT_MAX_AGE_SEC;
  document.cookie = `${REMEMBER_COOKIE}=${remember ? "1" : "0"}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

/** After a successful session, persist the preference cookie for future refreshes. */
export function persistRememberCookie(remember: boolean) {
  if (typeof window === "undefined") return;
  const maxAge = remember ? REMEMBER_MAX_AGE_SEC : REMEMBER_INTENT_MAX_AGE_SEC;
  document.cookie = `${REMEMBER_COOKIE}=${remember ? "1" : "0"}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}
