/**
 * Server read of live_match_state.
 * Callers get canonical live display for a public tournament ref.
 * The row's match id, tournament id, and provider payload stay here.
 */
import {
  isPublicTournamentRef,
  liveDisplayState,
  type LiveDisplayState,
} from "../../lib/live/view.ts";

export type { LiveDisplayState } from "../../lib/live/view.ts";

export type LiveTournamentState = {
  tournamentRef: string;
  matches: LiveSnapshotMatch[];
};

export const LIVE_MATCH_COLUMNS =
  "public_ref,phase,score_text,points_text,serving_side,provisional_winner_ref,received_at,occurred_at,sequence,sequence_source";

/**
 * A snapshot match: the canonical display plus the provider sequence, so a
 * frame held during a refetch is ordered against what the snapshot painted.
 */
export type LiveSnapshotMatch = LiveDisplayState & {
  sequence: number | null;
  sequenceSource: string | null;
};

function snapshotMatch(row: unknown): LiveSnapshotMatch | null {
  const view = liveDisplayState(row);
  if (!view) return null;
  const record = row as Record<string, unknown>;
  const sequence = typeof record.sequence === "number" ? record.sequence : Number(record.sequence);
  const source = record.sequence_source;
  return {
    ...view,
    sequence: Number.isFinite(sequence) ? sequence : null,
    sequenceSource: typeof source === "string" && source ? source : null,
  };
}

type LiveQuery = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (
        column: string,
        values: string[]
      ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

type EqResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & {
  maybeSingle: () => PromiseLike<{ data: unknown | null; error: { message: string } | null }>;
};

type TournamentLiveQuery = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => EqResult;
    };
  };
};

export async function readLiveMatches(
  supabase: LiveQuery,
  publicRefs: readonly string[]
): Promise<LiveDisplayState[]> {
  const refs = [...new Set(publicRefs.map((ref) => ref.trim()).filter(Boolean))].slice(0, 256);
  if (!refs.length) return [];
  const { data, error } = await supabase.from("live_match_state").select(LIVE_MATCH_COLUMNS).in("public_ref", refs);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const view = liveDisplayState(row);
    return view ? [view] : [];
  });
}

export async function readLiveTournamentState(
  supabase: TournamentLiveQuery,
  tournamentRef: string
): Promise<LiveTournamentState | null> {
  const ref = tournamentRef.trim();
  if (!isPublicTournamentRef(ref)) return null;
  const found = await supabase.from("tournaments").select("id").eq("slug", ref).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  const id =
    found.data && typeof found.data === "object"
      ? (found.data as { id?: unknown }).id
      : null;
  if (typeof id !== "string" || !id) return null;
  const { data, error } = await supabase
    .from("live_match_state")
    .select(LIVE_MATCH_COLUMNS)
    .eq("tournament_id", id);
  if (error) throw new Error(error.message);
  return {
    tournamentRef: ref,
    matches: (data ?? []).flatMap((row) => {
      const match = snapshotMatch(row);
      return match ? [match] : [];
    }),
  };
}

export async function getLiveTournamentState(
  tournamentRef: string
): Promise<LiveTournamentState | null> {
  const { createClient } = await import("@/lib/supabase/server");
  return readLiveTournamentState(createClient() as unknown as TournamentLiveQuery, tournamentRef);
}
