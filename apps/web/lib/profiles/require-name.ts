import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Send signed-in users without a display name to /welcome. */
export async function redirectIfMissingDisplayName(
  supabase: SupabaseClient,
  userId: string,
  nextPath: string
): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (data?.display_name?.trim()) return;

  redirect(
    `/welcome?next=${encodeURIComponent(nextPath || "/leagues")}`
  );
}
