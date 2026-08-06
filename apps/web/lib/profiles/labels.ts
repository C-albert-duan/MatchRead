import type { SupabaseClient } from "@supabase/supabase-js";

/** Map user_id → display_name (trimmed). Missing / blank omitted. */
export async function loadDisplayNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", unique);

  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const name = row.display_name?.trim();
    if (name) out[row.id] = name;
  }
  return out;
}

/** Standings / highlights label. Self is always "You". */
export function memberLabel(
  userId: string,
  selfId: string,
  names: Record<string, string>
): string {
  if (userId === selfId) return "You";
  const name = names[userId];
  if (name) return name;
  return `Player ${userId.slice(0, 8)}`;
}
