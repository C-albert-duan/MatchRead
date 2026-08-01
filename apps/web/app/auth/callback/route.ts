import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseEnv } from "@/lib/env";
import { publicOriginFromRequest } from "@/lib/site-origin";
import { safeNext } from "@/lib/safe-next";
import {
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE_SEC,
  mergeCookieOptions,
  parseRememberFlag,
} from "@/lib/auth/remember";

function mapAuthError(errorCode: string | null): string {
  if (errorCode === "otp_expired") return "otp_expired";
  if (errorCode === "access_denied") return "otp_expired";
  return "auth";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const origin = publicOriginFromRequest(request);
  const providerError = url.searchParams.get("error");
  const errorCode = url.searchParams.get("error_code");

  const fail = (error: string) => {
    const dest = new URL("/sign-in", origin);
    dest.searchParams.set("error", error);
    if (next && next !== "/") dest.searchParams.set("next", next);
    return NextResponse.redirect(dest);
  };

  if (!hasSupabaseEnv()) {
    return fail("config");
  }

  // Supabase verify already failed (often otp_expired from a second click /
  // email link scanner). No auth code to exchange.
  if (providerError) {
    return fail(mapAuthError(errorCode));
  }

  if (!code) {
    return fail("auth");
  }

  const cookieStore = cookies();
  const remember = parseRememberFlag(
    cookieStore.get(REMEMBER_COOKIE)?.value
  );
  const pending: { name: string; value: string; options: CookieOptions }[] =
    [];

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        pending.push({
          name,
          value,
          options: mergeCookieOptions(options, remember),
        });
      },
      remove(name: string, options: CookieOptions) {
        pending.push({
          name,
          value: "",
          options: mergeCookieOptions(options, remember),
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return fail("auth");
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  for (const cookie of pending) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  response.cookies.set({
    name: REMEMBER_COOKIE,
    value: remember ? "1" : "0",
    path: "/",
    sameSite: "lax",
    maxAge: remember ? REMEMBER_MAX_AGE_SEC : 60 * 60 * 24,
  });

  return response;
}
