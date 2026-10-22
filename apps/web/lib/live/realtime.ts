import { isPublicTournamentRef } from "./view.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LiveTournamentWatch = {
  ref: string;
  tournamentId: string;
};

/** One client topic for a public tournament ref. Not a match topic. */
export function liveTournamentTopic(ref: string): string {
  return `live:tournament:${ref.trim()}`;
}

/**
 * Match cells that share a public tournament ref become one watch.
 * A cell without a public ref or without a tournament id is not a channel.
 */
export function liveTournamentWatches(
  cells: readonly { tournamentRef: string | null; tournamentId: string | null }[]
): LiveTournamentWatch[] {
  const byRef = new Map<string, string>();
  for (const cell of cells) {
    const ref = cell.tournamentRef?.trim() ?? "";
    if (!isPublicTournamentRef(ref) || byRef.has(ref)) continue;
    const [tournamentId] = liveTournamentIds([cell.tournamentId]);
    if (!tournamentId) continue;
    byRef.set(ref, tournamentId);
  }
  return [...byRef.entries()]
    .map(([ref, tournamentId]) => ({ ref, tournamentId }))
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

/** Tournament ids on the page, ready for one Postgres Changes filter. */
export function liveTournamentIds(values: readonly (string | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    const id = value?.trim().toLowerCase() ?? "";
    if (UUID.test(id)) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * Postgres Changes filter for one tournament.
 * The shared publication stays `supabase_realtime`. This does not open a channel per match.
 */
export function liveTournamentChangeFilter(tournamentId: string | null | undefined): string | null {
  const [id] = liveTournamentIds([tournamentId]);
  if (!id) return null;
  return `tournament_id=eq.${id}`;
}
