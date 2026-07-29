import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import {
  REMEMBER_COOKIE,
  mergeCookieOptions,
  parseRememberFlag,
} from "@/lib/auth/remember";

export function createClient() {
  const cookieStore = cookies();
  const remember = parseRememberFlag(
    cookieStore.get(REMEMBER_COOKIE)?.value
  );

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({
            name,
            value,
            ...mergeCookieOptions(options, remember),
          });
        } catch {
          // Called from a Server Component — middleware will refresh the session.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({
            name,
            value: "",
            ...mergeCookieOptions(options, remember),
          });
        } catch {
          // See set()
        }
      },
    },
  });
}
