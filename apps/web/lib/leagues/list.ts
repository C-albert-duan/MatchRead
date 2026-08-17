import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueListItem, MemberRole } from "@/lib/leagues/types";

/** Leagues this member belongs to, most recently joined first. */
export async function listMemberLeagues(
  supabase: SupabaseClient,
  userId: string
): Promise<{ leagues: LeagueListItem[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from("members")
    .select(
      "role, leagues ( id, slug, name, format, visibility, owner_id, created_at, is_solo )"
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error) {
    return { leagues: [], error: error.message };
  }

  const leagueRows: Array<{
    role: MemberRole;
    league: Omit<
      LeagueListItem,
      "member_count" | "role" | "tournament_id" | "tournament_label"
    >;
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
  const tournamentByLeague = new Map<
    string,
    { tournament_id: string; tournament_label: string | null }
  >();

  if (ids.length > 0) {
    const [{ data: allMembers }, { data: ltRows }] = await Promise.all([
      supabase.from("members").select("league_id").in("league_id", ids),
      supabase
        .from("league_tournaments")
        .select("league_id, tournament_id, tournaments ( name )")
        .in("league_id", ids),
    ]);
    for (const m of allMembers ?? []) {
      countById.set(m.league_id, (countById.get(m.league_id) ?? 0) + 1);
    }
    for (const row of ltRows ?? []) {
      // Prefer first linked tournament (single leagues have at most one).
      if (tournamentByLeague.has(row.league_id)) continue;
      const t = Array.isArray(row.tournaments)
        ? row.tournaments[0]
        : row.tournaments;
      tournamentByLeague.set(row.league_id, {
        tournament_id: row.tournament_id,
        tournament_label: t?.name ?? null,
      });
    }
  }

  const leagues: LeagueListItem[] = leagueRows.map(({ role, league }) => {
    const linked = tournamentByLeague.get(league.id);
    return {
      ...league,
      tournament_id: linked?.tournament_id ?? null,
      tournament_label: linked?.tournament_label ?? null,
      member_count: countById.get(league.id) ?? 1,
      role,
    };
  });

  return { leagues, error: null };
}
