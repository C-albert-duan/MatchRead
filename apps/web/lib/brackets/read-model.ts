import type { BracketConfidence, BracketPicks, DrawSeat } from "@matchread/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnnouncedMatchupRow,
  OfficialResultsMap,
} from "./types.ts";
import { loadTournamentSeats, parseMatchKey } from "./types.ts";
import type {
  MatchPlayerSide,
  MatchScheduleRow,
  MatchSession,
} from "../tournaments/format.ts";
import { isPublicMatchRef } from "../tournaments/href.ts";

export type SheetMatchRow = {
  tournament_id: string;
  tournament_ref: string;
  tournament_name: string;
  venue_tz: string | null;
  draw_size: number | null;
  round: number;
  index_in_round: number;
  external_ref: string;
  scheduled_at: string | null;
  has_time: boolean | null;
  session: string | null;
  court: string | null;
  winner_player_id: string | null;
  voided: boolean | null;
  settled_at: string | null;
  official_score: string | null;
  fact_kind: string | null;
  side_a_player_id: string | null;
  side_a_last_name: string | null;
  side_b_player_id: string | null;
  side_b_last_name: string | null;
  winner_last_name: string | null;
};

export type TournamentEntry = {
  id: string;
  submittedAt: string | null;
  updatedAt: string | null;
  points: number | null;
  rank: number | null;
  championPlayerId: string | null;
};

export type TournamentReadOptions = {
  /** When set with userId, the same read returns that member's picks. */
  leagueId?: string;
  userId?: string;
};

export type TournamentReadModel = {
  ref: string | null;
  drawSize: number | null;
  venueTz: string | null;
  seats: DrawSeat[];
  matches: SheetMatchRow[];
  official: OfficialResultsMap;
  schedule: Record<string, MatchScheduleRow>;
  announced: AnnouncedMatchupRow[];
  picks: BracketPicks;
  confidence: BracketConfidence;
  entry: TournamentEntry | null;
};

const SHEET_COLUMNS =
  "tournament_id, tournament_ref, tournament_name, venue_tz, draw_size, round, index_in_round, external_ref, scheduled_at, has_time, session, court, winner_player_id, voided, settled_at, official_score, fact_kind, side_a_player_id, side_a_last_name, side_b_player_id, side_b_last_name, winner_last_name";

function factKindOf(
  value: string | null | undefined
): "played" | "withdrawal" | "void" | null {
  if (value === "played" || value === "withdrawal" || value === "void") {
    return value;
  }
  return null;
}

function sessionOf(value: string | null | undefined): MatchSession {
  if (value === "day" || value === "night") return value;
  return null;
}

function sideOf(
  id: string | null,
  lastName: string | null,
  seats: DrawSeat[]
): MatchPlayerSide | null {
  if (!id) return null;
  const seat = seats.find((item) => item.player_id === id);
  return {
    ref: id,
    lastName: lastName || seat?.last_name || "",
    seed: seat?.seed ?? null,
    countryCode: seat?.country_code || "XXX",
  };
}

export function projectTournamentSheet(
  seats: DrawSeat[],
  rows: SheetMatchRow[]
): Pick<TournamentReadModel, "official" | "schedule" | "announced"> {
  const official: OfficialResultsMap = {};
  const schedule: Record<string, MatchScheduleRow> = {};
  const announced: AnnouncedMatchupRow[] = [];

  for (const row of rows) {
    const key = `r${row.round}-m${row.index_in_round}`;
    const sideA = sideOf(row.side_a_player_id, row.side_a_last_name, seats);
    const sideB = sideOf(row.side_b_player_id, row.side_b_last_name, seats);
    const officialResult = Boolean(row.voided || row.winner_player_id);
    schedule[key] = {
      scheduled_at: row.scheduled_at,
      has_time: Boolean(row.has_time),
      session: sessionOf(row.session),
      court: row.court?.trim() || null,
      external_ref: row.external_ref,
      state: officialResult ? "official" : "scheduled",
      side_a: sideA,
      side_b: sideB,
    };
    if (officialResult) {
      official[key] = {
        winnerRef: row.voided ? null : row.winner_player_id,
        voided: Boolean(row.voided),
        officialScore: row.official_score?.trim() || null,
        factKind: factKindOf(row.fact_kind),
      };
    }
    if (!sideA && !sideB) continue;
    announced.push({
      match_key: key,
      player1_ref: sideA?.ref ?? "",
      player1_last_name: sideA?.lastName ?? "",
      player1_seed: sideA?.seed ?? null,
      player2_ref: sideB?.ref ?? "",
      player2_last_name: sideB?.lastName ?? "",
      player2_seed: sideB?.seed ?? null,
      scheduled_at: row.scheduled_at,
      has_time: Boolean(row.has_time),
      session: sessionOf(row.session),
      court: row.court?.trim() || null,
      external_ref: row.external_ref,
    });
  }

  announced.sort((a, b) => {
    const left = parseMatchKey(a.match_key);
    const right = parseMatchKey(b.match_key);
    if (!left || !right) return 0;
    return left.round - right.round || left.index_in_round - right.index_in_round;
  });

  return { official, schedule, announced };
}

type PickEmbed = {
  player_id: string | null;
  confidence: number | null;
  matches:
    | { round: number; index_in_round: number }
    | { round: number; index_in_round: number }[]
    | null;
};

type BracketEmbed = {
  id: string;
  submitted_at: string | null;
  updated_at: string | null;
  points: number | null;
  rank: number | null;
  champion_player_id: string | null;
  picks: PickEmbed[] | null;
};

function matchOf(
  embed: PickEmbed["matches"]
): { round: number; index_in_round: number } | null {
  const row = Array.isArray(embed) ? embed[0] : embed;
  if (!row || row.round == null || row.index_in_round == null) return null;
  return row;
}

/** One picks embed → match-key maps. No per-match lookup. */
export function projectMemberPicks(rows: PickEmbed[] | null | undefined): {
  picks: BracketPicks;
  confidence: BracketConfidence;
} {
  const picks: BracketPicks = {};
  const confidence: BracketConfidence = {};
  for (const row of rows ?? []) {
    const match = matchOf(row.matches);
    if (!match || row.player_id == null) continue;
    const key = `r${match.round}-m${match.index_in_round}`;
    picks[key] = row.player_id;
    if (row.confidence != null) confidence[key] = row.confidence;
  }
  return { picks, confidence };
}

async function loadMemberEntry(
  supabase: SupabaseClient,
  tournamentId: string,
  leagueId: string,
  userId: string
): Promise<{
  picks: BracketPicks;
  confidence: BracketConfidence;
  entry: TournamentEntry | null;
}> {
  const { data, error } = await supabase
    .from("brackets")
    .select(
      "id, submitted_at, updated_at, points, rank, champion_player_id, picks(player_id, confidence, matches(round, index_in_round))"
    )
    .eq("league_id", leagueId)
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`member picks: ${error.message}`);
  const bracket = data as BracketEmbed | null;
  const highlight = projectMemberPicks(bracket?.picks);
  if (!bracket) return { ...highlight, entry: null };
  return {
    ...highlight,
    entry: {
      id: bracket.id,
      submittedAt: bracket.submitted_at,
      updatedAt: bracket.updated_at,
      points: bracket.points,
      rank: bracket.rank,
      championPlayerId: bracket.champion_player_id,
    },
  };
}

/**
 * Seats, the match sheet, and — when a member is named — that member's picks.
 * One query each. Callers must not also query matches or players per row.
 */
export async function loadTournamentReadModel(
  supabase: SupabaseClient,
  tournamentId: string,
  options?: TournamentReadOptions
): Promise<TournamentReadModel> {
  const leagueId = options?.leagueId?.trim();
  const userId = options?.userId?.trim();
  const [seats, sheet, member] = await Promise.all([
    loadTournamentSeats(supabase, tournamentId),
    supabase
      .from("tournament_match_sheet")
      .select(SHEET_COLUMNS)
      .eq("tournament_id", tournamentId),
    leagueId && userId
      ? loadMemberEntry(supabase, tournamentId, leagueId, userId)
      : Promise.resolve(null),
  ]);

  const { data, error } = sheet;
  if (error) {
    throw new Error(`tournament sheet: ${error.message}`);
  }

  const matches = [...((data ?? []) as SheetMatchRow[])].sort(
    (a, b) => a.round - b.round || a.index_in_round - b.index_in_round
  );
  const head = matches[0];
  return {
    ref: head?.tournament_ref ?? null,
    drawSize: head?.draw_size ?? null,
    venueTz: head?.venue_tz ?? null,
    seats,
    matches,
    ...projectTournamentSheet(seats, matches),
    picks: member?.picks ?? {},
    confidence: member?.confidence ?? {},
    entry: member?.entry ?? null,
  };
}

/**
 * One sheet row by public `external_ref`.
 * A uuid or a bare numeric id is not looked up. There is no live-state read;
 * a match with no live row is the normal sheet, not an error.
 */
export async function loadPublicMatch(
  supabase: SupabaseClient,
  externalRef: string
): Promise<SheetMatchRow | null> {
  const ref = externalRef.trim();
  if (!isPublicMatchRef(ref)) return null;
  const { data, error } = await supabase
    .from("tournament_match_sheet")
    .select(SHEET_COLUMNS)
    .eq("external_ref", ref)
    .maybeSingle();
  if (error) {
    throw new Error(`public match: ${error.message}`);
  }
  return (data as SheetMatchRow | null) ?? null;
}
