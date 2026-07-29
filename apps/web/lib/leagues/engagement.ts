import {
  biggestMiss,
  bracketHealth,
  countPerfectBrackets,
  leagueHighlights,
  perfectPicksRemaining,
  type BracketHealth,
  type BracketPicks,
  type BiggestMiss,
  type DrawSeat,
  type LeagueHighlight,
  type OfficialResults,
} from "@matchread/core";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LeagueEngagement = {
  health: BracketHealth | null;
  perfectRemaining: number | null;
  perfectLeagueCount: number | null;
  biggestMiss: (BiggestMiss & { playerName?: string | null }) | null;
  highlights: Array<LeagueHighlight & { memberLabel: string; isYou: boolean }>;
};

export async function loadLeagueEngagement(input: {
  supabase: SupabaseClient;
  leagueId: string;
  userId: string;
  tournamentId: string;
  drawSize: number;
}): Promise<LeagueEngagement> {
  const { supabase, leagueId, userId, tournamentId, drawSize } = input;

  const empty: LeagueEngagement = {
    health: null,
    perfectRemaining: null,
    perfectLeagueCount: null,
    biggestMiss: null,
    highlights: [],
  };

  const { data: snaps } = await supabase
    .from("bracket_snapshots")
    .select(
      "user_id, score, max_score, upside, champion_alive, correct, incorrect, position_delta, previous_position, position"
    )
    .eq("league_id", leagueId)
    .eq("tournament_id", tournamentId);

  if (!snaps || snaps.length === 0) {
    return empty;
  }

  const mine = snaps.find((s) => s.user_id === userId) ?? null;
  let health: BracketHealth | null = null;
  if (mine) {
    health = bracketHealth({
      score: mine.score,
      maxScore: mine.max_score ?? 0,
      upside: mine.upside ?? 0,
      championAlive: mine.champion_alive,
    });
  }

  const perfectLeagueCount = countPerfectBrackets(
    snaps.map((s) => ({ incorrect: s.incorrect ?? 0 }))
  );

  const { data: results } = await supabase
    .from("match_results")
    .select("match_key, winner_ref, voided")
    .eq("tournament_id", tournamentId);

  const official: OfficialResults = {};
  for (const r of results ?? []) {
    official[r.match_key] = {
      winnerRef: r.winner_ref,
      voided: r.voided,
    };
  }

  const { data: draw } = await supabase
    .from("draws")
    .select("id")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  let seats: DrawSeat[] = [];
  if (draw) {
    const { data: seatRows } = await supabase
      .from("draw_seats")
      .select(
        "position, player_ref, last_name, seed, country_code, is_bye"
      )
      .eq("draw_id", draw.id)
      .order("position", { ascending: true });
    seats = (seatRows ?? []) as DrawSeat[];
  }

  const { data: myBracket } = await supabase
    .from("brackets")
    .select("picks")
    .eq("league_id", leagueId)
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .maybeSingle();

  const picks = (myBracket?.picks ?? {}) as BracketPicks;

  let perfectRemaining: number | null = null;
  let miss: (BiggestMiss & { playerName?: string | null }) | null = null;

  if (Object.keys(picks).length > 0) {
    perfectRemaining = perfectPicksRemaining({
      picks,
      official,
      drawSize,
      seats,
    });

    const rawMiss = biggestMiss({ picks, official, drawSize });
    if (rawMiss) {
      const seat = seats.find((s) => s.player_ref === rawMiss.playerRef);
      miss = {
        ...rawMiss,
        playerName: seat?.last_name ?? rawMiss.playerRef,
      };
    }
  }

  const highlightRows = snaps.map((s) => {
    const positionDelta =
      s.position_delta != null
        ? s.position_delta
        : s.previous_position != null && s.position != null
          ? s.previous_position - s.position
          : null;
    return {
      userId: s.user_id,
      positionDelta,
      correct: s.correct ?? 0,
      incorrect: s.incorrect ?? 0,
    };
  });

  const rawHighlights = leagueHighlights(highlightRows);
  const highlights = rawHighlights.map((h) => ({
    ...h,
    memberLabel:
      h.userId === userId ? "You" : `${h.userId.slice(0, 8)}…`,
    isYou: h.userId === userId,
  }));

  return {
    health,
    perfectRemaining,
    perfectLeagueCount,
    biggestMiss: miss,
    highlights,
  };
}
