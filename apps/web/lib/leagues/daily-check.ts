import {
  computeDailyCheck,
  gradeBracket,
  isOfficialPublicDraw,
  maxBracketScore,
  rankRows,
  type BracketPicks,
  type DailyCheck,
  type DrawSeat,
  type OfficialResults,
  type StandingPulseRow,
} from "@matchread/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isTournamentLocked,
  effectiveDrawSize,
  loadBracketPicksMap,
  loadLeagueDrawLock,
  loadOfficialResultsMap,
  loadTournamentSeats,
} from "@/lib/brackets/types";
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
  tournament_id?: string | null;
};

export type LeagueHomeBundle = {
  check: DailyCheck;
  youSubmitted: boolean;
  engagement: LeagueEngagement | null;
  eventComplete: boolean;
  tournament: {
    id: string;
    ref: string;
    name: string;
    has_draw: boolean;
  } | null;
};

async function resolveLeagueTournamentId(
  supabase: SupabaseClient,
  league: LeagueRow
): Promise<string | null> {
  if (league.tournament_id) return league.tournament_id;
  const { data } = await supabase
    .from("league_tournaments")
    .select("tournament_id")
    .eq("league_id", league.id)
    .limit(1)
    .maybeSingle();
  return data?.tournament_id ?? null;
}

/**
 * One round-trip wave for league home: tournament context + pulse + engagement.
 */
export async function loadDailyCheck(input: {
  supabase: SupabaseClient;
  league: LeagueRow;
  userId: string;
  memberCount: number;
}): Promise<LeagueHomeBundle> {
  const { supabase, league, userId, memberCount } = input;
  const hour = new Date().getHours();

  const tournamentId = await resolveLeagueTournamentId(supabase, league);

  const [tournamentRes, seasonRes] = await Promise.all([
    tournamentId
      ? supabase
          .from("tournaments")
          .select(
            "id, slug, name, lock_at, draw_size, published_at"
          )
          .eq("id", tournamentId)
          .maybeSingle()
      : Promise.resolve({ data: null as null }),
    supabase
      .from("season_points")
      .select("points")
      .eq("league_id", league.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const tournamentRow = tournamentRes.data;
  const season = seasonRes.data;

  // Rank season_points for this user (view has no position column).
  let seasonPosition: number | null = null;
  if (season?.points != null) {
    const { data: allSeason } = await supabase
      .from("season_points")
      .select("user_id, points")
      .eq("league_id", league.id);
    const ranked = rankRows(
      (allSeason ?? []).map((r) => ({
        userId: r.user_id,
        score: r.points ?? 0,
        tieBreak: r.user_id,
      }))
    );
    seasonPosition =
      ranked.find((r) => r.userId === userId)?.position ?? null;
  }

  if (!tournamentRow) {
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
      seasonPosition,
      seasonPoints: season?.points ?? null,
      hour,
    });
    return {
      check,
      youSubmitted: false,
      engagement: null,
      eventComplete: false,
      tournament: null,
    };
  }

  const tournament = {
    id: tournamentRow.id,
    ref: tournamentRow.slug as string,
    name: tournamentRow.name,
    lock_at: tournamentRow.lock_at as string | null,
    admin_locked_at: null as string | null,
    draw_size: tournamentRow.draw_size as number,
    published_at: tournamentRow.published_at as string | null,
  };

  const [
    bracketsRes,
    scoredRes,
    myBracketRes,
    leagueLockedAt,
    seats,
    officialMap,
  ] = await Promise.all([
    supabase
      .from("brackets")
      .select("id, user_id, submitted_at, points, rank, champion_player_id")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id),
    supabase
      .from("brackets")
      .select(
        "id, user_id, points, rank, champion_player_id, submitted_at"
      )
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .not("points", "is", null)
      .order("rank", { ascending: true }),
    supabase
      .from("brackets")
      .select("id, submitted_at")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", userId)
      .maybeSingle(),
    loadLeagueDrawLock(supabase, league.id, tournament.id),
    loadTournamentSeats(supabase, tournament.id),
    loadOfficialResultsMap(supabase, tournament.id),
  ]);

  const brackets = bracketsRes.data ?? [];
  const scored = scoredRes.data ?? [];
  const myBracket = myBracketRes.data;

  let picks: BracketPicks = {};
  if (myBracket?.id) {
    picks = await loadBracketPicksMap(supabase, myBracket.id);
  }

  const submittedCount = brackets.filter((b) => b.submitted_at).length;
  const youSubmitted = Boolean(myBracket?.submitted_at);

  const hasDraw =
    Boolean(tournamentRow.published_at) &&
    isOfficialPublicDraw(
      seats,
      effectiveDrawSize(seats.length, Number(tournament.draw_size) || 0)
    );
  const locked = isTournamentLocked({
    ...tournament,
    league_locked_at: leagueLockedAt,
    hasOfficialDraw: hasDraw,
  });

  const official: OfficialResults = {};
  let decidedCount = 0;
  for (const [key, row] of Object.entries(officialMap)) {
    official[key] = row;
    if (!row.voided && row.winnerRef) decidedCount++;
  }

  const expectedMatches = tournament.draw_size - 1;
  const eventComplete =
    locked && decidedCount >= expectedMatches && scored.length > 0;

  // Live grades for engagement / pulse (brackets may lack full snap fields).
  const drawSize = tournament.draw_size;
  let maxScore = 0;
  try {
    maxScore = maxBracketScore(drawSize);
  } catch {
    maxScore = 0;
  }
  type SnapRow = {
    user_id: string;
    score: number;
    max_score: number | null;
    upside: number | null;
    champion_alive: boolean | null;
    correct: number | null;
    incorrect: number | null;
    position_delta: number | null;
    previous_position: number | null;
    position: number | null;
    champion_ref: string | null;
    voided_picks: number;
  };

  const snaps: SnapRow[] = [];
  for (const b of scored) {
    const bPicks = await loadBracketPicksMap(supabase, b.id);
    const grade = gradeBracket({
      drawSize,
      picks: bPicks,
      official,
    });
    snaps.push({
      user_id: b.user_id,
      score: b.points ?? grade.score,
      max_score: maxScore,
      upside: grade.upside,
      champion_alive: grade.championAlive,
      correct: grade.correct,
      incorrect: grade.incorrect,
      position_delta: null,
      previous_position: null,
      position: b.rank ?? null,
      champion_ref: b.champion_player_id ?? grade.championRef,
      voided_picks: grade.voided,
    });
  }
  snaps.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

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
        const seat = seats.find((s) => s.player_id === mine.champion_ref);
        championName = seat?.last_name ?? mine.champion_ref;
      }

      you = {
        position: mine.position ?? fieldSize,
        previousPosition: mine.previous_position,
        positionDelta: mine.position_delta,
        score: mine.score,
        previousScore: null,
        scoreDelta: null,
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
    seasonPosition,
    seasonPoints: season?.points ?? null,
    hour,
    bracketHealth: engagement.health,
    biggestMiss: engagement.biggestMiss,
    perfectPicksRemaining: engagement.perfectRemaining,
    perfectBracketCount: engagement.perfectLeagueCount,
  });

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
    youSubmitted,
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
