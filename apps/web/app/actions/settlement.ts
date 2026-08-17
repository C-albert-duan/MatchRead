"use server";

import { revalidatePath } from "next/cache";
import {
  gradeBracket,
  rankRows,
  type BracketPicks,
  type OfficialResults,
} from "@matchread/core";
import { isFounderEmail } from "@/lib/auth/founder";
import {
  loadBracketPicksMap,
  parseMatchKey,
} from "@/lib/brackets/types";
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

async function loadOfficialFromMatches(
  supabase: ReturnType<typeof createClient>,
  tournamentId: string
): Promise<OfficialResults> {
  const { data: results } = await supabase
    .from("matches")
    .select("round, index_in_round, winner_player_id, voided")
    .eq("tournament_id", tournamentId);

  const official: OfficialResults = {};
  for (const row of results ?? []) {
    if (!row.voided && !row.winner_player_id) continue;
    official[`r${row.round}-m${row.index_in_round}`] = {
      winnerRef: row.voided ? null : row.winner_player_id,
      voided: Boolean(row.voided),
    };
  }
  return official;
}

export async function settleLeagueTournament(input: {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  /** Slam-class = 2, otherwise 1 — kept for callers; season_points is derived. */
  eventWeight?: number;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data: membership } = await supabase
    .from("members")
    .select("role")
    .eq("league_id", input.leagueId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: "Not a member of this league." };
  }

  if (membership.role !== "commissioner") {
    return { ok: false, error: "Only the commissioner can run settlement." };
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, draw_size")
    .eq("id", input.tournamentId)
    .maybeSingle();

  if (!tournament) {
    return { ok: false, error: "Tournament not found." };
  }

  const official = await loadOfficialFromMatches(supabase, input.tournamentId);
  if (Object.keys(official).length === 0) {
    return {
      ok: false,
      error: "No official results yet. Wait for match winners to settle.",
    };
  }

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id, user_id, submitted_at")
    .eq("league_id", input.leagueId)
    .eq("tournament_id", input.tournamentId)
    .not("submitted_at", "is", null);

  const drawSize = tournament.draw_size as number;

  type GradeRow = {
    userId: string;
    bracketId: string;
    score: number;
    championPlayerId: string | null;
    tieBreak: string;
  };

  const graded: GradeRow[] = [];
  for (const b of brackets ?? []) {
    const picks = await loadBracketPicksMap(supabase, b.id);
    const grade = gradeBracket({
      drawSize,
      picks: picks as BracketPicks,
      official,
    });
    graded.push({
      userId: b.user_id,
      bracketId: b.id,
      score: grade.score,
      championPlayerId: grade.championRef,
      tieBreak: b.user_id,
    });
  }

  const ranked = rankRows(graded);
  const now = new Date().toISOString();

  for (const row of ranked) {
    const { error } = await supabase
      .from("brackets")
      .update({
        points: row.score,
        rank: row.position,
        champion_player_id: row.championPlayerId,
        updated_at: now,
      })
      .eq("id", row.bracketId);

    if (error) {
      return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/leagues/${input.leagueSlug}`);
  revalidatePath(`/leagues/${input.leagueSlug}/season`);
  revalidatePath(`/leagues/${input.leagueSlug}/t/${input.tournamentRef}`);
  revalidatePath(
    `/leagues/${input.leagueSlug}/t/${input.tournamentRef}/result`
  );

  return { ok: true, graded: ranked.length };
}

/**
 * Operator void / withdrawal path.
 * Marks matches.voided from fromRound onward when the player is on the path.
 */
export async function stubVoidPlayer(input: {
  tournamentId: string;
  playerId: string;
  fromRound?: number;
  reason?: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required." };

  if (!isFounderEmail(user.email ?? undefined)) {
    return { ok: false, error: "Founder access required." };
  }

  const raw = input.playerId.trim();
  if (!raw) return { ok: false, error: "player_id is required." };

  let playerId = raw;
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      raw
    );
  if (!uuidLike) {
    const { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("provider_id", raw)
      .maybeSingle();
    if (!player?.id) {
      return { ok: false, error: "Player not found (id or provider_id)." };
    }
    playerId = player.id;
  }

  const fromRound = input.fromRound ?? 0;

  const { data: results, error: resultsError } = await supabase
    .from("matches")
    .select(
      "id, round, index_in_round, winner_player_id, voided, side_a_player_id, side_b_player_id"
    )
    .eq("tournament_id", input.tournamentId);

  if (resultsError) {
    return { ok: false, error: resultsError.message };
  }

  let voidedMatches = 0;
  for (const row of results ?? []) {
    if (row.round < fromRound) continue;
    if (row.voided) continue;
    const undecided = !row.winner_player_id;
    const onPlayerPath = row.winner_player_id === playerId;
    const onSide =
      row.side_a_player_id === playerId || row.side_b_player_id === playerId;
    if (!undecided && !onPlayerPath) continue;
    if (undecided && !onSide && !onPlayerPath) continue;

    const { error: updError } = await supabase
      .from("matches")
      .update({
        voided: true,
        winner_player_id: null,
        settled_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updError) {
      return {
        ok: false,
        error: `${updError.message} (matches update blocked — service role / ingest required.)`,
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
  return saveOfficialWinner({
    ...input,
    clearMatchKeys: [],
  });
}

/**
 * One round-trip: optionally clear dependent later results, then save this winner.
 */
export async function saveOfficialWinner(input: {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  matchKey: string;
  winnerRef: string;
  voided?: boolean;
  /** Later-round keys that become invalid when this winner changes. */
  clearMatchKeys?: string[];
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const matchKey = input.matchKey.trim();
  const winnerRef = input.winnerRef.trim();
  if (!matchKey) return { ok: false, error: "match_key is required." };
  if (!input.voided && !winnerRef) {
    return { ok: false, error: "winner_ref is required (or mark voided)." };
  }

  const parsed = parseMatchKey(matchKey);
  if (!parsed) return { ok: false, error: "Invalid match_key." };

  const founder = isFounderEmail(user.email ?? undefined);
  if (!founder) {
    const { data: membership } = await supabase
      .from("members")
      .select("role")
      .eq("league_id", input.leagueId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role !== "commissioner") {
      return { ok: false, error: "Commissioner or founder access required." };
    }
  }

  const toClear = (input.clearMatchKeys ?? []).filter(
    (k) => k && k !== matchKey
  );
  for (const key of toClear) {
    const clearParsed = parseMatchKey(key);
    if (!clearParsed) continue;
    const { error: clearError } = await supabase
      .from("matches")
      .update({
        winner_player_id: null,
        voided: false,
        settled_at: null,
      })
      .eq("tournament_id", input.tournamentId)
      .eq("round", clearParsed.round)
      .eq("index_in_round", clearParsed.index_in_round);
    if (clearError) {
      return {
        ok: false,
        error: `${clearError.message} (Need write access on matches.)`,
      };
    }
  }

  const { error } = await supabase
    .from("matches")
    .update({
      winner_player_id: input.voided ? null : winnerRef,
      voided: Boolean(input.voided),
      settled_at: new Date().toISOString(),
    })
    .eq("tournament_id", input.tournamentId)
    .eq("round", parsed.round)
    .eq("index_in_round", parsed.index_in_round);

  if (error) {
    return {
      ok: false,
      error: `${error.message} (Need write access on matches for this tournament.)`,
    };
  }

  revalidatePath(`/leagues/${input.leagueSlug}/t/${input.tournamentRef}`);
  return { ok: true, graded: 1 };
}

/**
 * Commissioner / founder: clear one or more official results.
 */
export async function clearOfficialResults(input: {
  leagueId: string;
  leagueSlug: string;
  tournamentId: string;
  tournamentRef: string;
  /** If omitted, clears every result for this tournament. */
  matchKeys?: string[];
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const founder = isFounderEmail(user.email ?? undefined);
  if (!founder) {
    const { data: membership } = await supabase
      .from("members")
      .select("role")
      .eq("league_id", input.leagueId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role !== "commissioner") {
      return { ok: false, error: "Commissioner or founder access required." };
    }
  }

  const patch = {
    winner_player_id: null as string | null,
    voided: false,
    settled_at: null as string | null,
  };

  if (input.matchKeys && input.matchKeys.length > 0) {
    for (const key of input.matchKeys) {
      const parsed = parseMatchKey(key);
      if (!parsed) continue;
      const { error } = await supabase
        .from("matches")
        .update(patch)
        .eq("tournament_id", input.tournamentId)
        .eq("round", parsed.round)
        .eq("index_in_round", parsed.index_in_round);
      if (error) {
        return {
          ok: false,
          error: `${error.message} (Need write access on matches.)`,
        };
      }
    }
  } else {
    const { error } = await supabase
      .from("matches")
      .update(patch)
      .eq("tournament_id", input.tournamentId);
    if (error) {
      return {
        ok: false,
        error: `${error.message} (Need write access on matches.)`,
      };
    }
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
