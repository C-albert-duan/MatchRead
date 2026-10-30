/**
 * My Tennis for one signed-in user: load context, then assemble in core.
 *
 * Candidates are matches in tournaments where the user holds a bracket and
 * the tournament ended no earlier than yesterday. The loaded context is
 * cached per user for 15 s; live patches on the client re-rank with the same
 * core `rankMyMatches`, so a refetch is not needed for every point.
 *
 * League members' picks are read only for a locked tournament, so the swing
 * reason never reflects picks that can still change.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { setsToWinFor } from "@matchread/core";
import { loadTournamentReadModel, projectMemberPicks } from "../../lib/brackets/read-model.ts";
import { isTournamentLocked } from "../../lib/brackets/types.ts";
import {
  assembleMyTennis,
  type MyTennisBracket,
  type MyTennisContext,
  type MyTennisMatch,
  type MyTennisRival,
  type MyTennisTournament,
  type MyTennisView,
} from "../../lib/me/my-tennis.ts";
import type { LiveDisplayState } from "../../lib/live/view.ts";
import { readImportanceConfig } from "../repositories/app-config.ts";
import { readLiveMatches } from "../repositories/live.ts";

export const MY_TENNIS_CONTEXT_TTL_MS = 15_000;
const MAX_CACHED_USERS = 500;

const contexts = new Map<string, { at: number; context: Omit<MyTennisContext, "live"> }>();

type BracketRow = {
  id: string;
  league_id: string;
  tournament_id: string;
  picks: Parameters<typeof projectMemberPicks>[0];
};

type TournamentRow = {
  id: string;
  slug: string;
  name: string;
  draw_size: number | null;
  tour: string | null;
  tier: string | null;
  lock_at: string | null;
};

type RivalRow = {
  league_id: string;
  tournament_id: string;
  user_id: string;
  points: number | null;
  picks: Parameters<typeof projectMemberPicks>[0];
};

function pairKey(leagueId: string, tournamentId: string): string {
  return `${leagueId}|${tournamentId}`;
}

/**
 * League members for each locked (league, tournament) the user is in, keyed
 * by `pairKey`. Season leagues add each member's points from the league's
 * other tournaments, and members with no bracket on this one still count.
 */
async function loadRivals(
  supabase: SupabaseClient,
  pairs: ReadonlyArray<{ leagueId: string; tournamentId: string; lockAt: string | null }>,
  now: Date
): Promise<Map<string, MyTennisRival[]>> {
  const out = new Map<string, MyTennisRival[]>();
  if (!pairs.length) return out;
  const leagueIds = [...new Set(pairs.map((pair) => pair.leagueId))];
  const tournamentIds = [...new Set(pairs.map((pair) => pair.tournamentId))];

  const [{ data: lockData, error: lockError }, { data: leagueData, error: leagueError }] =
    await Promise.all([
      supabase
        .from("league_tournaments")
        .select("league_id, tournament_id, locked_at")
        .in("league_id", leagueIds)
        .in("tournament_id", tournamentIds),
      supabase.from("leagues").select("id, format").in("id", leagueIds),
    ]);
  if (lockError) throw new Error(`my league locks: ${lockError.message}`);
  if (leagueError) throw new Error(`my leagues: ${leagueError.message}`);
  const leagueLock = new Map(
    ((lockData ?? []) as { league_id: string; tournament_id: string; locked_at: string | null }[]).map(
      (row) => [pairKey(row.league_id, row.tournament_id), row.locked_at]
    )
  );
  const locked = pairs.filter((pair) =>
    isTournamentLocked({
      lock_at: pair.lockAt,
      league_locked_at: leagueLock.get(pairKey(pair.leagueId, pair.tournamentId)) ?? null,
      now,
    })
  );
  if (!locked.length) return out;
  const wanted = new Set(locked.map((pair) => pairKey(pair.leagueId, pair.tournamentId)));
  const seasonIds = ((leagueData ?? []) as { id: string; format: string | null }[])
    .filter((row) => row.format === "season")
    .map((row) => row.id)
    .filter((id) => locked.some((pair) => pair.leagueId === id));

  const [{ data: rivalData, error: rivalError }, season] = await Promise.all([
    supabase
      .from("brackets")
      .select(
        "league_id, tournament_id, user_id, points, picks(player_id, confidence, matches(round, index_in_round))"
      )
      .in("league_id", [...new Set(locked.map((pair) => pair.leagueId))])
      .in("tournament_id", [...new Set(locked.map((pair) => pair.tournamentId))]),
    seasonIds.length
      ? supabase.from("season_points").select("league_id, user_id, points").in("league_id", seasonIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rivalError) throw new Error(`my league brackets: ${rivalError.message}`);
  if (season.error) throw new Error(`my season points: ${season.error.message}`);
  const seasonPoints = new Map<string, Map<string, number>>();
  for (const row of (season.data ?? []) as { league_id: string; user_id: string; points: number | null }[]) {
    const byUser = seasonPoints.get(row.league_id) ?? new Map<string, number>();
    byUser.set(row.user_id, row.points ?? 0);
    seasonPoints.set(row.league_id, byUser);
  }

  for (const row of (rivalData ?? []) as RivalRow[]) {
    const key = pairKey(row.league_id, row.tournament_id);
    if (!wanted.has(key)) continue;
    const total = seasonPoints.get(row.league_id)?.get(row.user_id);
    const list = out.get(key) ?? [];
    list.push({
      memberId: row.user_id,
      otherPoints: total == null ? 0 : total - (row.points ?? 0),
      picks: projectMemberPicks(row.picks).picks,
    });
    out.set(key, list);
  }
  for (const pair of locked) {
    const byUser = seasonPoints.get(pair.leagueId);
    if (!byUser) continue;
    const key = pairKey(pair.leagueId, pair.tournamentId);
    const list = out.get(key) ?? [];
    const present = new Set(list.map((rival) => rival.memberId));
    for (const [userId, points] of byUser) {
      if (!present.has(userId)) list.push({ memberId: userId, otherPoints: points, picks: {} });
    }
    out.set(key, list);
  }
  return out;
}

function yesterday(now: Date): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

function session(value: string | null): "day" | "night" | null {
  return value === "day" || value === "night" ? value : null;
}

async function loadContext(
  supabase: SupabaseClient,
  userId: string,
  now: Date
): Promise<Omit<MyTennisContext, "live">> {
  const { data: bracketData, error: bracketError } = await supabase
    .from("brackets")
    .select("id, league_id, tournament_id, picks(player_id, confidence, matches(round, index_in_round))")
    .eq("user_id", userId);
  if (bracketError) throw new Error(`my brackets: ${bracketError.message}`);
  const bracketRows = (bracketData ?? []) as BracketRow[];
  const tournamentIds = [...new Set(bracketRows.map((row) => row.tournament_id))];
  if (!tournamentIds.length) return { brackets: [], tournaments: {} };

  const { data: tournamentData, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, slug, name, draw_size, tour, tier, lock_at")
    .in("id", tournamentIds)
    .gte("ends_on", yesterday(now));
  if (tournamentError) throw new Error(`my tournaments: ${tournamentError.message}`);
  const current = ((tournamentData ?? []) as TournamentRow[]).filter((row) => row.draw_size);

  const tournaments: Record<string, MyTennisTournament> = {};
  const refById = new Map<string, string>();
  await Promise.all(
    current.map(async (row) => {
      const model = await loadTournamentReadModel(supabase, row.id);
      const matches: MyTennisMatch[] = model.matches.map((match) => ({
        key: `r${match.round}-m${match.index_in_round}`,
        externalRef: match.external_ref,
        round: match.round,
        sideARef: match.side_a_player_id,
        sideALastName: match.side_a_last_name,
        sideBRef: match.side_b_player_id,
        sideBLastName: match.side_b_last_name,
        winnerRef: match.voided ? null : match.winner_player_id,
        voided: Boolean(match.voided),
        officialScore: match.official_score,
        scheduledAt: match.scheduled_at,
        hasTime: Boolean(match.has_time),
        session: session(match.session),
        court: match.court?.trim() || null,
      }));
      tournaments[row.slug] = {
        id: row.id,
        ref: row.slug,
        name: row.name,
        drawSize: row.draw_size as number,
        setsToWin: setsToWinFor(row.tour, row.tier),
        seats: model.seats,
        matches,
      };
      refById.set(row.id, row.slug);
    })
  );

  const lockAt = new Map(current.map((row) => [row.id, row.lock_at]));
  const rivals = await loadRivals(
    supabase,
    bracketRows
      .filter((row) => refById.has(row.tournament_id))
      .map((row) => ({
        leagueId: row.league_id,
        tournamentId: row.tournament_id,
        lockAt: lockAt.get(row.tournament_id) ?? null,
      })),
    now
  );

  const brackets: MyTennisBracket[] = bracketRows.flatMap((row) => {
    const tournamentRef = refById.get(row.tournament_id);
    if (!tournamentRef) return [];
    return [
      {
        bracketId: row.id,
        leagueId: row.league_id,
        tournamentRef,
        picks: projectMemberPicks(row.picks).picks,
        league: rivals.get(pairKey(row.league_id, row.tournament_id)) ?? [],
      },
    ];
  });
  return { brackets, tournaments };
}

export async function viewMyTennis(
  supabase: SupabaseClient,
  userId: string,
  options: { now: Date }
): Promise<MyTennisView> {
  const nowMs = options.now.getTime();
  const hit = contexts.get(userId);
  let context = hit && nowMs - hit.at < MY_TENNIS_CONTEXT_TTL_MS ? hit.context : null;
  if (!context) {
    context = await loadContext(supabase, userId, options.now);
    if (contexts.size >= MAX_CACHED_USERS) {
      const oldest = contexts.keys().next().value;
      if (oldest !== undefined) contexts.delete(oldest);
    }
    contexts.set(userId, { at: nowMs, context });
  }

  // Only a match with both players known can be in play. readLiveMatches
  // caps one read at 256 refs; that covers the open matches of two 128-draws.
  const openRefs = Object.values(context.tournaments).flatMap((tournament) =>
    tournament.matches
      .filter((match) => !match.voided && !match.winnerRef && match.sideARef && match.sideBRef)
      .map((match) => match.externalRef)
  );
  // The repositories take narrow query shapes; the full client type is too
  // deep for the compiler to check against them (same cast as live.ts).
  // Live rows count only while the overlay is open (listener heartbeat under
  // 90 s, 0041). With the listener down, /me shows the official state, never
  // a frozen score as in play. Bracket pages get the same gate from /api/live.
  const overlay = await supabase.rpc("live_overlay_open");
  const overlayOpen = !overlay.error && overlay.data === true;
  const [liveRows, config] = await Promise.all([
    overlayOpen
      ? readLiveMatches(supabase as unknown as Parameters<typeof readLiveMatches>[0], openRefs)
      : Promise.resolve([]),
    readImportanceConfig(
      supabase as unknown as Parameters<typeof readImportanceConfig>[0],
      nowMs
    ),
  ]);
  const live: Record<string, LiveDisplayState> = {};
  for (const row of liveRows) live[row.publicRef] = row;

  return assembleMyTennis({ ...context, live }, config);
}

/** Tests only. */
export function resetMyTennisCache(): void {
  contexts.clear();
}
