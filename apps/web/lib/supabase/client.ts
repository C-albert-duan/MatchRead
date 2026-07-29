import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import {
  REMEMBER_COOKIE,
  authCookieOptions,
  parseRememberFlag,
} from "@/lib/auth/remember";

function readRememberFromDocument(): boolean {
  if (typeof document === "undefined") return true;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${REMEMBER_COOKIE}=`));
  return parseRememberFlag(match?.split("=")[1]);
}

export function createClient() {
  const remember = readRememberFromDocument();
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookieOptions: authCookieOptions(remember),
  });
}
