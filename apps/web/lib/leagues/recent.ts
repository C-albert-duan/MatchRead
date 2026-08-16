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

  const [tournamentRes, drawRes, snapRes, settledRes] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, ref, name")
      .eq("id", tournamentId)
      .maybeSingle(),
    supabase
      .from("draws")
      .select("id")
      .eq("tournament_id", tournamentId)
      .maybeSingle(),
    picked
      ? supabase
          .from("bracket_snapshots")
          .select(
            "position, score, position_delta, score_delta, correct, champion_alive"
          )
          .eq("league_id", league.id)
          .eq("tournament_id", tournamentId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({
          data: null as {
            position: number | null;
            score: number;
            position_delta: number | null;
            score_delta: number | null;
            correct: number | null;
            champion_alive: boolean | null;
          } | null,
        }),
    supabase
      .from("match_results")
      .select("match_key", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .not("winner_ref", "is", null)
      .eq("voided", false),
  ]);

  const tournament = tournamentRes.data;
  const mine = snapRes.data;
  let fieldSize: number | null = null;
  if (mine?.position != null) {
    const { count } = await supabase
      .from("bracket_snapshots")
      .select("user_id", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("tournament_id", tournamentId);
    fieldSize = count ?? null;
  }

  return {
    league,
    tournament: tournament
      ? {
          id: tournament.id,
          ref: tournament.ref,
          name: tournament.name,
          hasDraw: Boolean(drawRes.data),
        }
      : null,
    submittedAt: picked?.submitted_at ?? null,
    draftUpdatedAt,
    standing:
      mine?.position != null && fieldSize != null
        ? {
            position: mine.position,
            score: mine.score,
            fieldSize,
            positionDelta: mine.position_delta ?? null,
            scoreDelta: mine.score_delta ?? null,
            correct: mine.correct ?? null,
            championAlive:
              mine.champion_alive == null ? null : Boolean(mine.champion_alive),
          }
        : null,
    settledMatches: settledRes.count ?? null,
  };
}
