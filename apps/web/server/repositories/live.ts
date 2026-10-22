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
  matches: LiveDisplayState[];
};

export const LIVE_MATCH_COLUMNS =
  "public_ref,phase,score_text,points_text,serving_side,provisional_winner_ref,received_at,occurred_at";

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
      const view = liveDisplayState(row);
      return view ? [view] : [];
    }),
  };
}

export async function getLiveTournamentState(
  tournamentRef: string
): Promise<LiveTournamentState | null> {
  const { createClient } = await import("@/lib/supabase/server");
  return readLiveTournamentState(createClient() as unknown as TournamentLiveQuery, tournamentRef);
}
