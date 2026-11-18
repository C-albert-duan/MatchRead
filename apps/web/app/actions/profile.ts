"use server";

import { revalidatePath } from "next/cache";
import { actionError } from "@/lib/actions/errors";
import { reportError } from "@/lib/report-error";
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
    return { ok: false, error: actionError("display_name_invalid") };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: actionError("sign_in") };
  }

  const { data, error } = await supabase.rpc("set_my_display_name", {
    p_name: name,
  });

  if (error) {
    // Only a missing RPC (an old database) may fall back to the direct write.
    // Any other error is the RPC refusing the name; the upsert used to hide
    // it and store the name anyway (fix list P2-11).
    const missing = error.code === "PGRST202" || error.code === "42883";
    if (!missing) {
      if (/display name/i.test(error.message ?? "")) {
        return { ok: false, error: actionError("display_name_invalid") };
      }
      reportError(error, { source: "display_name" });
      return { ok: false, error: actionError("display_name_failed") };
    }
    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: name,
    });
    if (upsertError) {
      reportError(upsertError, { source: "display_name" });
      return { ok: false, error: actionError("display_name_failed") };
    }
  }

  void data;
  revalidatePath("/", "layout");
  return { ok: true, displayName: name };
}
