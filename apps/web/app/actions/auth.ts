"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  if (!hasSupabaseEnv()) {
    redirect("/");
  }
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
