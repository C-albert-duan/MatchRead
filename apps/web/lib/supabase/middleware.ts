import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import {
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE_SEC,
  mergeCookieOptions,
  parseRememberFlag,
} from "@/lib/auth/remember";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  if (!hasSupabaseEnv()) {
    return response;
  }

  const remember = parseRememberFlag(
    request.cookies.get(REMEMBER_COOKIE)?.value
  );

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        const merged = mergeCookieOptions(options, remember);
        request.cookies.set({ name, value, ...merged });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set({ name, value, ...merged });
        // Keep preference cookie aligned with session lifetime when remembering
        if (remember) {
          response.cookies.set({
            name: REMEMBER_COOKIE,
            value: "1",
            path: "/",
            sameSite: "lax",
            maxAge: REMEMBER_MAX_AGE_SEC,
          });
        }
      },
      remove(name: string, options: CookieOptions) {
        const merged = mergeCookieOptions(options, remember);
        request.cookies.set({ name, value: "", ...merged });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set({ name, value: "", ...merged });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}
