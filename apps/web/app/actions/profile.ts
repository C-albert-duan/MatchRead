"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionResult =
  | { ok: true; displayName: string }
  | { ok: false; error: string };

function normalizeDisplayName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 32) return null;
  return name;
}

export async function saveMyDisplayName(
  rawName: string
): Promise<ProfileActionResult> {
  const name = normalizeDisplayName(rawName);
  if (!name) {
    return {
      ok: false,
      error: "Choose a display name between 2 and 32 characters.",
    };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data, error } = await supabase.rpc("set_my_display_name", {
    p_name: name,
  });

  if (error) {
    // Fallback if migration 0009 not applied yet
    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: name,
    });
    if (upsertError) {
      return { ok: false, error: error.message || upsertError.message };
    }
  }

  void data;
  revalidatePath("/", "layout");
  return { ok: true, displayName: name };
}
