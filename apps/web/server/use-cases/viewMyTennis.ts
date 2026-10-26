/**
 * My Tennis for one signed-in user: load context, then assemble in core.
 *
 * Candidates are matches in tournaments where the user holds a bracket and
 * the tournament ended no earlier than yesterday. The loaded context is
 * cached per user for 15 s; live patches on the client re-rank with the same
 * core `rankMyMatches`, so a refetch is not needed for every point.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTournamentReadModel, projectMemberPicks } from "../../lib/brackets/read-model.ts";
import {
  assembleMyTennis,
  type MyTennisBracket,
  type MyTennisContext,
  type MyTennisMatch,
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

type TournamentRow = { id: string; slug: string; name: string; draw_size: number | null };

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
    .select("id, slug, name, draw_size")
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
        ref: row.slug,
        name: row.name,
        drawSize: row.draw_size as number,
        seats: model.seats,
        matches,
      };
      refById.set(row.id, row.slug);
    })
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
  const [liveRows, config] = await Promise.all([
    readLiveMatches(supabase as unknown as Parameters<typeof readLiveMatches>[0], openRefs),
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
