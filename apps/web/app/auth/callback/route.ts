import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";

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
  const pending: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        pending.push({ name, value, options });
      },
      remove(name: string, options: CookieOptions) {
        pending.push({ name, value: "", options });
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
  return response;
}
