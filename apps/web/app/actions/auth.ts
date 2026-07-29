"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REMEMBER_COOKIE } from "@/lib/auth/remember";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  if (!hasSupabaseEnv()) {
    redirect("/");
  }
  const supabase = createClient();
  await supabase.auth.signOut();
  try {
    cookies().set({
      name: REMEMBER_COOKIE,
      value: "",
      path: "/",
      maxAge: 0,
    });
  } catch {
    // ignore
  }
  revalidatePath("/", "layout");
  redirect("/");
}
