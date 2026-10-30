import type { createClient } from "@/lib/supabase/server";

/** league_tournaments ids for one league (RLS: members only). */
export async function loadScheduledIds(
  supabase: ReturnType<typeof createClient>,
  leagueId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from("league_tournaments")
    .select("tournament_id")
    .eq("league_id", leagueId);
  return new Set((data ?? []).map((row) => row.tournament_id as string));
}
