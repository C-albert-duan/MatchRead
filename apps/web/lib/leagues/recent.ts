import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueListItem } from "@/lib/leagues/types";

export type RecentBracketRow = {
  league_id: string;
  tournament_id: string;
  submitted_at: string | null;
  updated_at: string | null;
};

/** Latest submitted bracket that still belongs to this member's leagues. */
export function pickRecentSubmittedBracket(
  rows: RecentBracketRow[],
  leagueIds: Set<string>
): RecentBracketRow | null {
  const submitted = rows
    .filter((row) => row.submitted_at && leagueIds.has(row.league_id))
    .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
  return submitted[0] ?? null;
}

export type RecentLeagueActivity = {
  league: LeagueListItem;
  tournament: {
    id: string;
    ref: string;
    name: string;
    hasDraw: boolean;
  } | null;
  submittedAt: string | null;
  draftUpdatedAt: string | null;
  standing: {
    position: number;
    score: number;
    fieldSize: number;
    positionDelta: number | null;
    scoreDelta: number | null;
    correct: number | null;
    championAlive: boolean | null;
  } | null;
  settledMatches: number | null;
};

/**
 * The member's most recently submitted bracket (else most recently joined
 * league). Facts only — no Daily Check copy.
 */
export async function loadRecentLeagueActivity(
  supabase: SupabaseClient,
  userId: string,
  leagues: LeagueListItem[]
): Promise<RecentLeagueActivity | null> {
  if (leagues.length === 0) return null;

  const byId = new Map(leagues.map((league) => [league.id, league]));
  const ids = leagues.map((league) => league.id);
  const leagueIds = new Set(ids);

  const { data: bracketRows } = await supabase
    .from("brackets")
    .select("league_id, tournament_id, submitted_at, updated_at")
    .eq("user_id", userId)
    .in("league_id", ids);

  const picked = pickRecentSubmittedBracket(bracketRows ?? [], leagueIds);
  const league = picked ? byId.get(picked.league_id) ?? leagues[0] : leagues[0];
  const tournamentId = picked?.tournament_id ?? league.tournament_id ?? null;

  const draftRow =
    !picked
      ? (bracketRows ?? [])
          .filter((row) => row.league_id === league.id && row.updated_at)
          .sort((a, b) =>
            String(b.updated_at).localeCompare(String(a.updated_at))
          )[0]
      : undefined;
  const draftUpdatedAt = draftRow?.updated_at ?? null;

  if (!tournamentId) {
    return {
      league,
      tournament: null,
      submittedAt: picked?.submitted_at ?? null,
      draftUpdatedAt,
      standing: null,
      settledMatches: null,
    };
  }

  const [tournamentRes, myBracketRes, settledRes] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, slug, name, published_at")
      .eq("id", tournamentId)
      .maybeSingle(),
    picked
      ? supabase
          .from("brackets")
          .select("points, rank, champion_player_id")
          .eq("league_id", league.id)
          .eq("tournament_id", tournamentId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({
          data: null as {
            points: number | null;
            rank: number | null;
            champion_player_id: string | null;
          } | null,
        }),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .not("winner_player_id", "is", null)
      .eq("voided", false),
  ]);

  const tournament = tournamentRes.data;
  const mine = myBracketRes.data;
  let fieldSize: number | null = null;
  if (mine?.rank != null) {
    const { count } = await supabase
      .from("brackets")
      .select("user_id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("tournament_id", tournamentId)
      .not("points", "is", null);
    fieldSize = count ?? null;
  }

  return {
    league,
    tournament: tournament
      ? {
          id: tournament.id,
          ref: tournament.slug,
          name: tournament.name,
          hasDraw: Boolean(tournament.published_at),
        }
      : null,
    submittedAt: picked?.submitted_at ?? null,
    draftUpdatedAt,
    standing:
      mine?.rank != null && mine.points != null && fieldSize != null
        ? {
            position: mine.rank,
            score: mine.points,
            fieldSize,
            positionDelta: null,
            scoreDelta: null,
            correct: null,
            championAlive: null,
          }
        : null,
    settledMatches: settledRes.count ?? null,
  };
}
