import {
  computeDailyCheck,
  type DailyCheck,
  type StandingPulseRow,
} from "@matchread/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isTournamentLocked } from "@/lib/brackets/types";
import {
  loadLeagueEngagement,
  type LeagueEngagement,
} from "@/lib/leagues/engagement";

type LeagueRow = {
  id: string;
  slug: string;
  name: string;
  format: string;
  tournament_label: string | null;
};

export async function loadDailyCheck(input: {
  supabase: SupabaseClient;
  league: LeagueRow;
  userId: string;
  memberCount: number;
}): Promise<{ check: DailyCheck; engagement: LeagueEngagement | null }> {
  const { supabase, league, userId, memberCount } = input;
  const hour = new Date().getHours();

  let tournament: {
    id: string;
    ref: string;
    name: string;
    lock_at: string | null;
    admin_locked_at: string | null;
    draw_size: number;
  } | null = null;
  let hasDraw = false;

  if (league.tournament_label) {
    const { data: t } = await supabase
      .from("tournaments")
      .select("id, ref, name, lock_at, admin_locked_at, draw_size")
      .eq("name", league.tournament_label)
      .maybeSingle();
    tournament = t;
    if (t) {
      const { data: draw } = await supabase
        .from("draws")
        .select("id")
        .eq("tournament_id", t.id)
        .maybeSingle();
      hasDraw = Boolean(draw);
    }
  }

  const eventName = tournament?.name ?? league.tournament_label ?? league.name;
  const tournamentRef = tournament?.ref ?? null;
  const locked = tournament ? isTournamentLocked(tournament) : false;

  let submittedCount = 0;
  let youSubmitted = false;
  if (tournament) {
    const { count } = await supabase
      .from("brackets")
      .select("*", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .not("submitted_at", "is", null);
    submittedCount = count ?? 0;

    const { data: mine } = await supabase
      .from("brackets")
      .select("submitted_at")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", userId)
      .maybeSingle();
    youSubmitted = Boolean(mine?.submitted_at);
  }

  let you: StandingPulseRow | null = null;
  let leader: { score: number; upside: number; label: string } | null = null;
  let fieldSize = memberCount;
  let eventComplete = false;

  if (tournament) {
    const { data: snaps } = await supabase
      .from("bracket_snapshots")
      .select(
        "user_id, score, position, previous_position, position_delta, score_delta, upside, champion_alive, champion_ref, voided_picks, max_score"
      )
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .order("position", { ascending: true });

    fieldSize = Math.max(memberCount, snaps?.length ?? 0);

    const { count: resultCount } = await supabase
      .from("match_results")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournament.id)
      .eq("voided", false);

    const expectedMatches = tournament.draw_size - 1;
    eventComplete =
      locked &&
      (resultCount ?? 0) >= expectedMatches &&
      (snaps?.length ?? 0) > 0;

    if (snaps && snaps.length > 0) {
      const top = snaps[0];
      leader = {
        score: top.score,
        upside: top.upside ?? 0,
        label: top.user_id === userId ? "You" : "The leader",
      };

      const mine = snaps.find((s) => s.user_id === userId);
      if (mine) {
        let championName: string | null = null;
        if (mine.champion_ref) {
          const { data: draw } = await supabase
            .from("draws")
            .select("id")
            .eq("tournament_id", tournament.id)
            .maybeSingle();
          if (draw) {
            const { data: seat } = await supabase
              .from("draw_seats")
              .select("last_name")
              .eq("draw_id", draw.id)
              .eq("player_ref", mine.champion_ref)
              .maybeSingle();
            championName = seat?.last_name ?? mine.champion_ref;
          } else {
            championName = mine.champion_ref;
          }
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
  }

  const { data: season } = await supabase
    .from("season_standings")
    .select("position, points")
    .eq("league_id", league.id)
    .eq("user_id", userId)
    .maybeSingle();

  let engagement: LeagueEngagement | null = null;
  if (tournament && hasDraw) {
    engagement = await loadLeagueEngagement({
      supabase,
      leagueId: league.id,
      userId,
      tournamentId: tournament.id,
      drawSize: tournament.draw_size,
    });
  }

  const check = computeDailyCheck({
    eventName,
    leagueSlug: league.slug,
    tournamentRef,
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
    bracketHealth: engagement?.health ?? null,
    biggestMiss: engagement?.biggestMiss ?? null,
    perfectPicksRemaining: engagement?.perfectRemaining ?? null,
    perfectBracketCount: engagement?.perfectLeagueCount ?? null,
  });

  void supabase.from("daily_check_log").upsert(
    {
      league_id: league.id,
      user_id: userId,
      tournament_id: tournament?.id ?? null,
      kind: check.kind,
      payload: check,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "league_id,user_id" }
  );

  return { check, engagement };
}
