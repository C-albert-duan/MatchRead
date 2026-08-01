"use server";

import { revalidatePath } from "next/cache";
import {
  gradeBracket,
  maxBracketScore,
  rankRows,
  seasonPoints,
  type BracketPicks,
  type OfficialResults,
} from "@matchread/core";
import { isFounderEmail } from "@/lib/auth/founder";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; graded: number }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function settleLeagueTournament(input: {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  /** Slam-class = 2, otherwise 1 */
  eventWeight?: number;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: membership } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", input.leagueId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: "Not a member of this league." };
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, draw_size")
    .eq("id", input.tournamentId)
    .maybeSingle();

  if (!tournament) {
    return { ok: false, error: "Tournament not found." };
  }

  const { data: results } = await supabase
    .from("match_results")
    .select("match_key, winner_ref, voided")
    .eq("tournament_id", input.tournamentId);

  if (!results?.length) {
    return {
      ok: false,
      error: "No official results yet. Apply migration 0004 or publish results.",
    };
  }

  const official: OfficialResults = {};
  for (const row of results) {
    official[row.match_key] = {
      winnerRef: row.winner_ref,
      voided: row.voided,
    };
  }

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id, user_id, picks, submitted_at")
    .eq("league_id", input.leagueId)
    .eq("tournament_id", input.tournamentId)
    .not("submitted_at", "is", null);

  const { data: priorSnaps } = await supabase
    .from("bracket_snapshots")
    .select("user_id, position, score")
    .eq("league_id", input.leagueId)
    .eq("tournament_id", input.tournamentId);

  const priorByUser = new Map(
    (priorSnaps ?? []).map((s) => [
      s.user_id,
      { position: s.position as number | null, score: s.score as number },
    ])
  );

  const drawSize = tournament.draw_size as number;
  const maxScore = maxBracketScore(drawSize);
  const weight = input.eventWeight ?? 2;

  type GradeRow = {
    userId: string;
    bracketId: string;
    score: number;
    correct: number;
    incorrect: number;
    voided: number;
    upside: number;
    championRef: string | null;
    championAlive: boolean | null;
    tieBreak: string;
  };

  const graded: GradeRow[] = [];
  for (const b of brackets ?? []) {
    const grade = gradeBracket({
      drawSize,
      picks: (b.picks ?? {}) as BracketPicks,
      official,
    });
    graded.push({
      userId: b.user_id,
      bracketId: b.id,
      score: grade.score,
      correct: grade.correct,
      incorrect: grade.incorrect,
      voided: grade.voided,
      upside: grade.upside,
      championRef: grade.championRef,
      championAlive: grade.championAlive,
      tieBreak: b.user_id,
    });
  }

  const ranked = rankRows(graded);

  for (const row of ranked) {
    const prior = priorByUser.get(row.userId);
    const previousPosition = prior?.position ?? null;
    const previousScore = prior?.score ?? null;

    const { error } = await supabase.from("bracket_snapshots").upsert(
      {
        league_id: input.leagueId,
        tournament_id: input.tournamentId,
        user_id: row.userId,
        bracket_id: row.bracketId,
        score: row.score,
        correct: row.correct,
        incorrect: row.incorrect,
        voided_picks: row.voided,
        upside: row.upside,
        max_score: maxScore,
        champion_ref: row.championRef,
        champion_alive: row.championAlive,
        position: row.position,
        previous_position: previousPosition,
        score_delta:
          previousScore != null ? row.score - previousScore : null,
        position_delta:
          previousPosition != null ? previousPosition - row.position : null,
        ranked_at: new Date().toISOString(),
      },
      { onConflict: "league_id,tournament_id,user_id" }
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    // Season aggregate: replace this event's contribution via full recompute
  }

  // Recompute season standings from all snapshots in this league
  const seasonResult = await recomputeSeasonStandings(
    supabase,
    input.leagueId,
    weight
  );
  if (!seasonResult.ok) return seasonResult;

  revalidatePath(`/leagues/${input.leagueSlug}`);
  revalidatePath(`/leagues/${input.leagueSlug}/season`);
  revalidatePath(`/leagues/${input.leagueSlug}/t/${input.tournamentRef}`);

  return { ok: true, graded: ranked.length };
}

async function recomputeSeasonStandings(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  defaultWeight: number
): Promise<ActionResult> {
  const { data: snaps } = await supabase
    .from("bracket_snapshots")
    .select("user_id, score, max_score, tournament_id")
    .eq("league_id", leagueId);

  const { data: priorSeason } = await supabase
    .from("season_standings")
    .select("user_id, position, points")
    .eq("league_id", leagueId);

  const prior = new Map(
    (priorSeason ?? []).map((r) => [
      r.user_id,
      { position: r.position as number | null, points: r.points as number },
    ])
  );

  const byUser = new Map<string, number>();
  for (const s of snaps ?? []) {
    const pts = seasonPoints(
      s.score,
      s.max_score || 1,
      defaultWeight
    );
    byUser.set(s.user_id, (byUser.get(s.user_id) ?? 0) + pts);
  }

  const ranked = rankRows(
    [...byUser.entries()].map(([userId, score]) => ({
      userId,
      score,
      tieBreak: userId,
    }))
  );

  for (const row of ranked) {
    const prev = prior.get(row.userId);
    const { error } = await supabase.from("season_standings").upsert(
      {
        league_id: leagueId,
        user_id: row.userId,
        points: row.score,
        position: row.position,
        previous_position: prev?.position ?? null,
        points_delta: prev != null ? row.score - prev.points : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id,user_id" }
    );
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, graded: ranked.length };
}

function parseMatchRound(matchKey: string): number | null {
  const m = /^r(\d+)-m\d+$/.exec(matchKey);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Operator void / withdrawal path.
 * Records pick_voids and marks future undecided (or player-won-path)
 * match_results as voided when RLS allows. No service-role in browser.
 */
export async function stubVoidPlayer(input: {
  tournamentId: string;
  playerRef: string;
  fromRound?: number;
  reason?: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required." };

  if (!isFounderEmail(user.email ?? undefined)) {
    return { ok: false, error: "Founder access required." };
  }

  const playerRef = input.playerRef.trim();
  if (!playerRef) return { ok: false, error: "player_ref is required." };

  const fromRound = input.fromRound ?? 0;

  const { error } = await supabase.from("pick_voids").upsert(
    {
      tournament_id: input.tournamentId,
      player_ref: playerRef,
      from_round: fromRound,
      reason: input.reason?.trim() || "withdrawal",
    },
    { onConflict: "tournament_id,player_ref,from_round" }
  );

  if (error) {
    return {
      ok: false,
      error: `${error.message} (Need commissioner RLS on a league for this tournament, or check pick_voids policies.)`,
    };
  }

  const { data: results, error: resultsError } = await supabase
    .from("match_results")
    .select("match_key, winner_ref, voided")
    .eq("tournament_id", input.tournamentId);

  if (resultsError) {
    return { ok: false, error: resultsError.message };
  }

  let voidedMatches = 0;
  for (const row of results ?? []) {
    const round = parseMatchRound(row.match_key);
    if (round == null || round < fromRound) continue;
    if (row.voided) continue;
    const undecided = !row.winner_ref;
    const onPlayerPath = row.winner_ref === playerRef;
    if (!undecided && !onPlayerPath) continue;

    const { error: updError } = await supabase
      .from("match_results")
      .update({ voided: true })
      .eq("tournament_id", input.tournamentId)
      .eq("match_key", row.match_key);

    if (updError) {
      return {
        ok: false,
        error: `${updError.message} (pick_voids saved; match_results update blocked by RLS — commissioner write required.)`,
      };
    }
    voidedMatches++;
  }

  return { ok: true, graded: voidedMatches };
}

/**
 * Commissioner / founder: upsert one official match result (ingest path for beta).
 */
export async function recordOfficialResult(input: {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  matchKey: string;
  winnerRef: string;
  voided?: boolean;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const matchKey = input.matchKey.trim();
  const winnerRef = input.winnerRef.trim();
  if (!matchKey) return { ok: false, error: "match_key is required." };
  if (!input.voided && !winnerRef) {
    return { ok: false, error: "winner_ref is required (or mark voided)." };
  }

  const founder = isFounderEmail(user.email ?? undefined);
  if (!founder) {
    const { data: membership } = await supabase
      .from("league_members")
      .select("role")
      .eq("league_id", input.leagueId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role !== "commissioner") {
      return { ok: false, error: "Commissioner or founder access required." };
    }
  }

  const { error } = await supabase.from("match_results").upsert(
    {
      tournament_id: input.tournamentId,
      match_key: matchKey,
      winner_ref: input.voided ? null : winnerRef,
      voided: Boolean(input.voided),
      settled_at: new Date().toISOString(),
    },
    { onConflict: "tournament_id,match_key" }
  );

  if (error) {
    return {
      ok: false,
      error: `${error.message} (Need commissioner write RLS on match_results for this tournament.)`,
    };
  }

  revalidatePath(`/leagues/${input.leagueSlug}/t/${input.tournamentRef}`);
  return { ok: true, graded: 1 };
}

/**
 * Founder: settle every league that has submitted brackets for this tournament.
 */
export async function settleAllLeaguesForTournament(input: {
  tournamentId: string;
  tournamentRef: string;
  eventWeight?: number;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required." };
  if (!isFounderEmail(user.email ?? undefined)) {
    return { ok: false, error: "Founder access required." };
  }

  const { data: bracketRows, error } = await supabase
    .from("brackets")
    .select("league_id")
    .eq("tournament_id", input.tournamentId)
    .not("submitted_at", "is", null);

  if (error) return { ok: false, error: error.message };

  const leagueIds = [...new Set((bracketRows ?? []).map((r) => r.league_id))];
  if (leagueIds.length === 0) {
    return { ok: true, graded: 0 };
  }

  const { data: leagues, error: leagueError } = await supabase
    .from("leagues")
    .select("id, slug")
    .in("id", leagueIds);

  if (leagueError) return { ok: false, error: leagueError.message };

  let graded = 0;
  for (const league of leagues ?? []) {
    const result = await settleLeagueTournament({
      leagueId: league.id,
      leagueSlug: league.slug,
      tournamentId: input.tournamentId,
      tournamentRef: input.tournamentRef,
      eventWeight: input.eventWeight,
    });
    if (!result.ok) return result;
    graded += result.graded;
  }

  return { ok: true, graded };
}
