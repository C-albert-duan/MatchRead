import type { SupabaseClient } from "@supabase/supabase-js";
import { roundLabel } from "../../../../packages/core/src/bracket.ts";
import {
  captionTimeZone,
  matchScheduleCaption,
  type MatchSession,
} from "../tournaments/format.ts";
import { tournamentHref } from "../tournaments/href.ts";
import { loadPublicMatch, type SheetMatchRow } from "./read-model.ts";

export type MatchDetailLabels = {
  locale: string;
  match: string;
  official: string;
  scheduled: string;
  voided: string;
  winner: string;
  withdrawal: string;
  tba: string;
  tbc: string;
  day: string;
  night: string;
  notFoundTitle: string;
  notFoundBody: string;
};

export type MatchDetail = {
  round: string;
  sideA: string;
  sideB: string;
  state: string;
  lead: string;
  winner: string | null;
  withdrawal: boolean;
  session: string | null;
  court: string | null;
  tournamentName: string;
  tournamentHref: string;
};

export type MatchRouteResponse =
  | { status: 404; location: null; title: string; body: string }
  | { status: 200; location: null; detail: MatchDetail };

function sideLabel(name: string | null): string {
  return name?.trim() || "—";
}

function roundTitle(drawSize: number | null, round: number): string | null {
  if (!drawSize || drawSize < 2) return null;
  const remaining = drawSize / 2 ** round;
  if (!Number.isInteger(remaining) || remaining < 2) return null;
  return roundLabel(remaining).match;
}

/** Settled or scheduled sheet. A null row is a 404, not a match and not a redirect. */
export function presentMatchDetail(
  match: SheetMatchRow,
  labels: MatchDetailLabels
): MatchDetail {
  const session: MatchSession =
    match.session === "day" || match.session === "night" ? match.session : null;
  const caption = matchScheduleCaption(
    {
      scheduled_at: match.scheduled_at,
      has_time: Boolean(match.has_time),
      session,
      court: match.court,
    },
    captionTimeZone(null, match.venue_tz),
    labels.locale,
    labels
  );
  const voided = Boolean(match.voided);
  const hasWinner = !voided && Boolean(match.winner_player_id);
  const score =
    (hasWinner || voided) && match.official_score?.trim()
      ? match.official_score.trim()
      : null;
  return {
    round: roundTitle(match.draw_size, match.round) ?? labels.match,
    sideA: sideLabel(match.side_a_last_name),
    sideB: sideLabel(match.side_b_last_name),
    state: voided ? labels.voided : hasWinner ? labels.official : labels.scheduled,
    lead: score ?? caption.when ?? labels.tba,
    winner: hasWinner && match.winner_last_name?.trim() ? match.winner_last_name.trim() : null,
    withdrawal: match.fact_kind === "withdrawal",
    session: session === "day" ? labels.day : session === "night" ? labels.night : null,
    court: match.court?.trim() || null,
    tournamentName: match.tournament_name,
    tournamentHref: tournamentHref(match.tournament_ref),
  };
}

/**
 * Public match route. Unknown and non-public refs are 404.
 * There is no redirect and no invented match.
 */
export async function respondMatchRoute(
  ref: string,
  supabase: SupabaseClient,
  labels: MatchDetailLabels
): Promise<MatchRouteResponse> {
  const match = await loadPublicMatch(supabase, decodeURIComponent(ref).trim());
  if (!match) {
    return {
      status: 404,
      location: null,
      title: labels.notFoundTitle,
      body: labels.notFoundBody,
    };
  }
  return { status: 200, location: null, detail: presentMatchDetail(match, labels) };
}
