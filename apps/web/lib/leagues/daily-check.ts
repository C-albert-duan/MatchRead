import {
  computeDailyCheck,
  type BracketPicks,
  type DailyCheck,
  type DrawSeat,
  type OfficialResults,
  type StandingPulseRow,
} from "@matchread/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isTournamentLocked } from "@/lib/brackets/types";
import {
  buildLeagueEngagement,
  EMPTY_ENGAGEMENT,
  type LeagueEngagement,
} from "@/lib/leagues/engagement";
import { loadDisplayNames, memberLabel } from "@/lib/profiles/labels";

type LeagueRow = {
  id: string;
  slug: string;
  name: string;
  format: string;
  tournament_label: string | null;
};

export type LeagueHomeBundle = {
  check: DailyCheck;
  engagement: LeagueEngagement | null;
  eventComplete: boolean;
  tournament: {
    id: string;
    ref: string;
    name: string;
    has_draw: boolean;
  } | null;
};

/**
 * One round-trip wave for league home: tournament context + pulse + engagement.
 * Avoids the old waterfall (15+ sequential Supabase calls).
 */
export async function loadDailyCheck(input: {
  supabase: SupabaseClient;
  league: LeagueRow;
  userId: string;
  memberCount: number;
}): Promise<LeagueHomeBundle> {
  const { supabase, league, userId, memberCount } = input;
  const hour = new Date().getHours();

  // Wave 1: tournament + season (independent)
  const [tournamentRes, seasonRes] = await Promise.all([
    league.tournament_label
      ? supabase
          .from("tournaments")
          .select("id, ref, name, lock_at, admin_locked_at, draw_size")
          .eq("name", league.tournament_label)
          .maybeSingle()
      : Promise.resolve({ data: null as null }),
    supabase
      .from("season_standings")
      .select("position, points")
      .eq("league_id", league.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const tournament = tournamentRes.data;
  const season = seasonRes.data;

  if (!tournament) {
    const check = computeDailyCheck({
      eventName: league.tournament_label ?? league.name,
      leagueSlug: league.slug,
      tournamentRef: null,
      memberCount,
      submittedCount: 0,
      youSubmitted: false,
      hasDraw: false,
      locked: false,
      eventComplete: false,
      you: null,
      leader: null,
      fieldSize: memberCount,
      seasonPosition: season?.position ?? null,
      seasonPoints: season?.points ?? null,
      hour,
    });
    return {
      check,
      engagement: null,
      eventComplete: false,
      tournament: null,
    };
  }

  // Wave 2: everything keyed by tournament id — parallel
  const [
    drawRes,
    bracketsRes,
    snapsRes,
    resultsRes,
    myBracketRes,
  ] = await Promise.all([
    supabase
      .from("draws")
      .select("id")
      .eq("tournament_id", tournament.id)
      .maybeSingle(),
    supabase
      .from("brackets")
      .select("user_id, submitted_at")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id),
    supabase
      .from("bracket_snapshots")
      .select(
        "user_id, score, position, previous_position, position_delta, score_delta, upside, champion_alive, champion_ref, voided_picks, max_score, correct, incorrect"
      )
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .order("position", { ascending: true }),
    supabase
      .from("match_results")
      .select("match_key, winner_ref, voided")
      .eq("tournament_id", tournament.id),
    supabase
      .from("brackets")
      .select("picks, submitted_at")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const draw = drawRes.data;
  const hasDraw = Boolean(draw);
  const locked = isTournamentLocked(tournament);
  const brackets = bracketsRes.data ?? [];
  const snaps = snapsRes.data ?? [];
  const results = resultsRes.data ?? [];
  const myBracket = myBracketRes.data;
  const picks = (myBracket?.picks ?? {}) as BracketPicks;

  const submittedCount = brackets.filter((b) => b.submitted_at).length;
  const youSubmitted = Boolean(myBracket?.submitted_at);

  // Wave 3: seats only if we have a draw (needed for names / engagement)
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

  const official: OfficialResults = {};
  let decidedCount = 0;
  for (const r of results) {
    official[r.match_key] = {
      winnerRef: r.winner_ref,
      voided: r.voided,
    };
    if (!r.voided && r.winner_ref) decidedCount++;
  }

  const expectedMatches = tournament.draw_size - 1;
  const eventComplete =
    locked && decidedCount >= expectedMatches && snaps.length > 0;

  const fieldSize = Math.max(memberCount, snaps.length);
  let you: StandingPulseRow | null = null;
  let leader: { score: number; upside: number; label: string } | null = null;
  let displayNames: Record<string, string> = {};

  if (snaps.length > 0) {
    displayNames = await loadDisplayNames(
      supabase,
      snaps.map((s) => s.user_id)
    );
    const top = snaps[0];
    leader = {
      score: top.score,
      upside: top.upside ?? 0,
      label: memberLabel(top.user_id, userId, displayNames),
    };

    const mine = snaps.find((s) => s.user_id === userId);
    if (mine) {
      let championName: string | null = null;
      if (mine.champion_ref) {
        const seat = seats.find((s) => s.player_ref === mine.champion_ref);
        championName = seat?.last_name ?? mine.champion_ref;
      }

      const positionDelta =
        mine.position_delta != null
          ? mine.position_delta
          : mine.previous_position != null && mine.position != null
            ? mine.previous_position - mine.position
            : null;

      you = {
        position: mine.position ?? fieldSize,
        previousPosition: mine.previous_position,
        positionDelta,
        score: mine.score,
        previousScore:
          mine.score_delta != null ? mine.score - mine.score_delta : null,
        scoreDelta: mine.score_delta,
        upside: mine.upside ?? 0,
        championAlive: mine.champion_alive,
        voidedPicks: mine.voided_picks ?? 0,
        championRef: mine.champion_ref,
        championName,
      };
    }
  }

  const engagement =
    hasDraw
      ? buildLeagueEngagement({
          userId,
          drawSize: tournament.draw_size,
          snaps,
          official,
          seats,
          picks,
          displayNames,
        })
      : EMPTY_ENGAGEMENT;

  const check = computeDailyCheck({
    eventName: tournament.name,
    leagueSlug: league.slug,
    tournamentRef: tournament.ref,
    memberCount,
    submittedCount,
    youSubmitted,
    hasDraw,
    locked,
    eventComplete,
    you,
    leader,
    fieldSize,
    seasonPosition: season?.position ?? null,
    seasonPoints: season?.points ?? null,
    hour,
    bracketHealth: engagement.health,
    biggestMiss: engagement.biggestMiss,
    perfectPicksRemaining: engagement.perfectRemaining,
    perfectBracketCount: engagement.perfectLeagueCount,
  });

  // Fire-and-forget cache — never await (ignore missing table / errors)
  void Promise.resolve(
    supabase.from("daily_check_log").upsert(
      {
        league_id: league.id,
        user_id: userId,
        tournament_id: tournament.id,
        kind: check.kind,
        payload: check,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "league_id,user_id" }
    )
  );

  return {
    check,
    engagement: hasDraw ? engagement : null,
    eventComplete,
    tournament: {
      id: tournament.id,
      ref: tournament.ref,
      name: tournament.name,
      has_draw: hasDraw,
    },
  };
}
