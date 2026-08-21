import type { BracketPicks, DrawSeat, EntryStatus, SeatKind } from "@matchread/core";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TournamentSurface =
  | "hard"
  | "clay"
  | "grass"
  | "indoor"
  | "carpet";

export type Tournament = {
  id: string;
  /** URL slug (DB column `slug`). */
  ref: string;
  name: string;
  surface: TournamentSurface;
  starts_on: string | null;
  lock_at: string | null;
  admin_locked_at: string | null;
  draw_size: number;
  venue_tz: string;
  published_at?: string | null;
};

export type BracketRow = {
  id: string;
  league_id: string;
  tournament_id: string;
  user_id: string;
  picks: BracketPicks;
  submitted_at: string | null;
  updated_at: string;
  points?: number | null;
  rank?: number | null;
  champion_player_id?: string | null;
};

export type DrawSeatRow = DrawSeat;

export const SEAT_SELECT =
  "position, kind, player_id, seed, entry, tbd_label, players(last_name, display_name, country_code)";

export const DRAW_SEAT_SELECT = SEAT_SELECT;

type SeatQueryRow = {
  position: number;
  kind?: SeatKind | null;
  player_id?: string | null;
  seed?: number | null;
  entry?: EntryStatus | null;
  tbd_label?: string | null;
  last_name?: string | null;
  country_code?: string | null;
  players?:
    | {
        last_name?: string | null;
        display_name?: string | null;
        country_code?: string | null;
      }
    | {
        last_name?: string | null;
        display_name?: string | null;
        country_code?: string | null;
      }[]
    | null;
};

export function mapDrawSeat(row: SeatQueryRow): DrawSeat {
  const kind: SeatKind =
    row.kind ?? (row.player_id ? "player" : row.tbd_label ? "tbd" : "bye");
  const player =
    Array.isArray(row.players) ? row.players[0] : row.players ?? null;
  const last =
    row.last_name ??
    player?.display_name ??
    player?.last_name ??
    (kind === "tbd" ? row.tbd_label ?? "TBD" : kind === "bye" ? "" : "");
  return {
    position: row.position,
    kind,
    player_id: row.player_id ?? null,
    last_name: last || "",
    seed: row.seed ?? null,
    country_code: row.country_code || player?.country_code || "XXX",
    entry: row.entry ?? null,
    tbd_label: row.tbd_label ?? null,
  };
}

/**
 * Bracket size for display / `isOfficialPublicDraw`.
 * Prefer an exact power-of-two seat count over a missing/wrong `draw_size` hint
 * so a published sheet still renders after lock / on court.
 */
export function effectiveDrawSize(
  seatCount: number,
  hinted: number | null | undefined
): number {
  if (seatCount >= 2 && (seatCount & (seatCount - 1)) === 0) return seatCount;
  const h = Number(hinted) || 0;
  if (h >= 2 && (h & (h - 1)) === 0) return h;
  return seatCount > 0 ? seatCount : h;
}

export function isTournamentLocked(t: {
  lock_at: string | null;
  admin_locked_at?: string | null;
  league_locked_at?: string | null;
  hasOfficialDraw?: boolean;
  now?: Date;
}): boolean {
  if (t.admin_locked_at) return true;
  if (t.league_locked_at) return true;
  if (t.hasOfficialDraw === false) return false;
  if (!t.lock_at) return false;
  const now = t.now ?? new Date();
  return new Date(t.lock_at).getTime() <= now.getTime();
}

export function isPlatformLocked(t: {
  lock_at: string | null;
  admin_locked_at?: string | null;
  hasOfficialDraw?: boolean;
  now?: Date;
}): boolean {
  return isTournamentLocked({
    lock_at: t.lock_at,
    admin_locked_at: t.admin_locked_at,
    hasOfficialDraw: t.hasOfficialDraw,
    now: t.now,
  });
}

/** Timed first ball has been played. Date-only rows are not a start. */
export function isTimedMatchStarted(
  row: { scheduled_at?: string | null; has_time?: boolean | null },
  now: Date = new Date()
): boolean {
  if (!row.has_time || !row.scheduled_at) return false;
  const at = new Date(row.scheduled_at);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() <= now.getTime();
}

export async function loadLeagueDrawLock(
  supabase: SupabaseClient,
  leagueId: string,
  tournamentId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("league_tournaments")
    .select("locked_at")
    .eq("league_id", leagueId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  return (data as { locked_at?: string } | null)?.locked_at ?? null;
}

/** Load picks as matchKey → player_id using matches.round/index. */
export async function loadBracketPicksMap(
  supabase: SupabaseClient,
  bracketId: string
): Promise<BracketPicks> {
  const { data: pickRows } = await supabase
    .from("picks")
    .select("player_id, match_id, matches(round, index_in_round)")
    .eq("bracket_id", bracketId);

  const out: BracketPicks = {};
  for (const row of pickRows ?? []) {
    const m = Array.isArray(row.matches) ? row.matches[0] : row.matches;
    if (!m || row.player_id == null) continue;
    const key = `r${m.round}-m${m.index_in_round}`;
    out[key] = row.player_id;
  }
  return out;
}

/** Convert matchKey→playerId picks to save_picks RPC payload. */
export async function picksToSavePayload(
  supabase: SupabaseClient,
  tournamentId: string,
  picks: BracketPicks
): Promise<{ match_id: string; player_id: string }[]> {
  const { data: matches } = await supabase
    .from("matches")
    .select("id, round, index_in_round")
    .eq("tournament_id", tournamentId);

  const byKey = new Map(
    (matches ?? []).map((m) => [`r${m.round}-m${m.index_in_round}`, m.id])
  );
  const out: { match_id: string; player_id: string }[] = [];
  for (const [key, playerId] of Object.entries(picks)) {
    const matchId = byKey.get(key);
    if (!matchId || !playerId) continue;
    out.push({ match_id: matchId, player_id: playerId });
  }
  return out;
}

/** matchKey → confidence from picks rows. */
export async function loadBracketConfidenceMap(
  supabase: SupabaseClient,
  bracketId: string
): Promise<Record<string, number>> {
  const { data: pickRows } = await supabase
    .from("picks")
    .select("confidence, match_id, matches(round, index_in_round)")
    .eq("bracket_id", bracketId);

  const out: Record<string, number> = {};
  for (const row of pickRows ?? []) {
    const m = Array.isArray(row.matches) ? row.matches[0] : row.matches;
    if (!m || row.confidence == null) continue;
    out[`r${m.round}-m${m.index_in_round}`] = row.confidence;
  }
  return out;
}

/** Convert matchKey confidence map to match_id keys for save_picks. */
export async function confidenceToSavePayload(
  supabase: SupabaseClient,
  tournamentId: string,
  confidence: Record<string, number>
): Promise<Record<string, number>> {
  const { data: matches } = await supabase
    .from("matches")
    .select("id, round, index_in_round")
    .eq("tournament_id", tournamentId);

  const byKey = new Map(
    (matches ?? []).map((m) => [`r${m.round}-m${m.index_in_round}`, m.id])
  );
  const out: Record<string, number> = {};
  for (const [key, level] of Object.entries(confidence)) {
    const matchId = byKey.get(key);
    if (!matchId || level == null) continue;
    out[matchId] = level;
  }
  return out;
}

export type OfficialResultsMap = Record<
  string,
  { winnerRef: string | null; voided: boolean }
>;

/** Official winners: matchKey `r{N}-m{M}` → winner_player_id. */
export async function loadOfficialResultsMap(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<OfficialResultsMap> {
  const { data: rows } = await supabase
    .from("matches")
    .select("round, index_in_round, winner_player_id, voided")
    .eq("tournament_id", tournamentId);

  const out: OfficialResultsMap = {};
  for (const row of rows ?? []) {
    if (!row.voided && !row.winner_player_id) continue;
    out[`r${row.round}-m${row.index_in_round}`] = {
      winnerRef: row.voided ? null : row.winner_player_id,
      voided: Boolean(row.voided),
    };
  }
  return out;
}

export type MatchScheduleMap = Record<
  string,
  { scheduled_at: string; has_time: boolean }
>;

export async function loadMatchScheduleMap(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<MatchScheduleMap> {
  const { data: rows } = await supabase
    .from("matches")
    .select("round, index_in_round, scheduled_at, has_time")
    .eq("tournament_id", tournamentId)
    .not("scheduled_at", "is", null);

  const out: MatchScheduleMap = {};
  for (const row of rows ?? []) {
    if (!row.scheduled_at) continue;
    out[`r${row.round}-m${row.index_in_round}`] = {
      scheduled_at: row.scheduled_at,
      has_time: Boolean(row.has_time),
    };
  }
  return out;
}

export type AnnouncedMatchupRow = {
  match_key: string;
  player1_ref: string;
  player1_last_name: string;
  player1_seed: number | null;
  player2_ref: string;
  player2_last_name: string;
  player2_seed: number | null;
  scheduled_at: string | null;
  has_time: boolean;
};

/**
 * Announced / in-play pairs from matches + player joins.
 * Default: round 0, both sides named (fillable announced field).
 * Pass `allRounds: true` and `bothSidesOnly: false` to list every
 * published side for a live tournament when seats are not loaded yet.
 */
export async function loadAnnouncedMatchups(
  supabase: SupabaseClient,
  tournamentId: string,
  opts?: {
    round?: number;
    bothSidesOnly?: boolean;
    /** When true, ignore `round` and return every match with a named side. */
    allRounds?: boolean;
  }
): Promise<AnnouncedMatchupRow[]> {
  const bothSidesOnly = opts?.bothSidesOnly ?? true;
  const allRounds = Boolean(opts?.allRounds);

  let query = supabase
    .from("matches")
    .select(
      "round, index_in_round, side_a_player_id, side_b_player_id, scheduled_at, has_time"
    )
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true })
    .order("index_in_round", { ascending: true });

  if (!allRounds) {
    query = query.eq("round", opts?.round ?? 0);
  }

  const { data: rows } = await query;

  const playerIds = new Set<string>();
  for (const row of rows ?? []) {
    if (row.side_a_player_id) playerIds.add(row.side_a_player_id);
    if (row.side_b_player_id) playerIds.add(row.side_b_player_id);
  }

  const names = new Map<string, string>();
  const seatSeeds = new Map<string, number | null>();
  if (playerIds.size > 0) {
    const [{ data: players }, { data: seats }] = await Promise.all([
      supabase
        .from("players")
        .select("id, last_name")
        .in("id", [...playerIds]),
      supabase
        .from("seats")
        .select("player_id, seed")
        .eq("tournament_id", tournamentId)
        .in("player_id", [...playerIds]),
    ]);
    for (const p of players ?? []) names.set(p.id, p.last_name);
    for (const s of seats ?? []) {
      if (s.player_id) seatSeeds.set(s.player_id, s.seed ?? null);
    }
  }

  const out: AnnouncedMatchupRow[] = [];
  for (const row of rows ?? []) {
    const aId = row.side_a_player_id as string | null;
    const bId = row.side_b_player_id as string | null;
    if (bothSidesOnly && (!aId || !bId)) continue;
    if (!aId && !bId) continue;

    out.push({
      match_key: `r${row.round}-m${row.index_in_round}`,
      player1_ref: aId ?? "",
      player1_last_name: aId ? (names.get(aId) ?? "") : "",
      player1_seed: aId ? (seatSeeds.get(aId) ?? null) : null,
      player2_ref: bId ?? "",
      player2_last_name: bId ? (names.get(bId) ?? "") : "",
      player2_seed: bId ? (seatSeeds.get(bId) ?? null) : null,
      scheduled_at: row.scheduled_at ?? null,
      has_time: Boolean(row.has_time),
    });
  }
  return out;
}

export async function loadTournamentSeats(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<DrawSeat[]> {
  const { data: seatRows } = await supabase
    .from("seats")
    .select(SEAT_SELECT)
    .eq("tournament_id", tournamentId)
    .order("position", { ascending: true });
  return (seatRows ?? []).map(mapDrawSeat);
}

/** Parse `r{N}-m{M}` into round + index. */
export function parseMatchKey(
  matchKey: string
): { round: number; index_in_round: number } | null {
  const m = /^r(\d+)-m(\d+)$/.exec(matchKey.trim());
  if (!m) return null;
  return { round: Number(m[1]), index_in_round: Number(m[2]) };
}
