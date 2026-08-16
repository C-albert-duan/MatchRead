import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueListItem, MemberRole } from "@/lib/leagues/types";

/** Leagues this member belongs to, most recently joined first. */
export async function listMemberLeagues(
  supabase: SupabaseClient,
  userId: string
): Promise<{ leagues: LeagueListItem[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from("league_members")
    .select(
      "role, leagues ( id, slug, name, format, visibility, tournament_label, tournament_id, commissioner_id, created_at, is_solo )"
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error) {
    return { leagues: [], error: error.message };
  }

  const leagueRows: Array<{
    role: MemberRole;
    league: Omit<LeagueListItem, "member_count" | "role">;
  }> = [];

  for (const row of rows ?? []) {
    const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
    if (!league) continue;
    leagueRows.push({
      role: row.role as MemberRole,
      league: {
        ...league,
        is_solo: Boolean((league as { is_solo?: boolean }).is_solo),
      },
    });
  }

  const ids = leagueRows.map((r) => r.league.id);
  const countById = new Map<string, number>();
  if (ids.length > 0) {
    const { data: allMembers } = await supabase
      .from("league_members")
      .select("league_id")
      .in("league_id", ids);
    for (const m of allMembers ?? []) {
      countById.set(m.league_id, (countById.get(m.league_id) ?? 0) + 1);
    }
  }

  const leagues: LeagueListItem[] = leagueRows.map(({ role, league }) => ({
    ...league,
    member_count: countById.get(league.id) ?? 1,
    role,
  }));

  return { leagues, error: null };
}
