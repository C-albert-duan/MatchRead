import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import {
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE_SEC,
  mergeCookieOptions,
  parseRememberFlag,
} from "@/lib/auth/remember";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const origin = url.origin;

  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(`${origin}/sign-in?error=config`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=auth`);
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
    return NextResponse.redirect(`${origin}/sign-in?error=auth`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  for (const cookie of pending) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  // Persist remember preference for future middleware refreshes
  response.cookies.set({
    name: REMEMBER_COOKIE,
    value: remember ? "1" : "0",
    path: "/",
    sameSite: "lax",
    maxAge: remember ? REMEMBER_MAX_AGE_SEC : 60 * 60 * 24,
  });

  return response;
}
