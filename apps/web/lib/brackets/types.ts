import type { BracketPicks, DrawSeat } from "@matchread/core";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TournamentSurface =
  | "hard"
  | "clay"
  | "grass"
  | "indoor"
  | "carpet";

export type Tournament = {
  id: string;
  ref: string;
  name: string;
  surface: TournamentSurface;
  starts_on: string | null;
  lock_at: string | null;
  admin_locked_at: string | null;
  draw_size: number;
  venue_tz: string;
};

export type Draw = {
  id: string;
  tournament_id: string;
  published_at: string;
};

export type BracketRow = {
  id: string;
  league_id: string;
  tournament_id: string;
  user_id: string;
  picks: BracketPicks;
  submitted_at: string | null;
  updated_at: string;
};

export type DrawSeatRow = DrawSeat;

export function isTournamentLocked(t: {
  lock_at: string | null;
  admin_locked_at: string | null;
  league_locked_at?: string | null;
  now?: Date;
}): boolean {
  if (t.admin_locked_at) return true;
  if (t.league_locked_at) return true;
  if (!t.lock_at) return false;
  const now = t.now ?? new Date();
  return new Date(t.lock_at).getTime() <= now.getTime();
}

/** Platform first-ball / founder lock — ignores a commissioner league lock. */
export function isPlatformLocked(t: {
  lock_at: string | null;
  admin_locked_at: string | null;
  now?: Date;
}): boolean {
  return isTournamentLocked({
    lock_at: t.lock_at,
    admin_locked_at: t.admin_locked_at,
    now: t.now,
  });
}

export async function loadLeagueDrawLock(
  supabase: SupabaseClient,
  leagueId: string,
  tournamentId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("league_draw_locks")
    .select("locked_at")
    .eq("league_id", leagueId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  return (data as { locked_at?: string } | null)?.locked_at ?? null;
}
