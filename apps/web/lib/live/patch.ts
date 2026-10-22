import {
  matchSheetPresentation,
  type LiveOverlay,
  type MatchSheetPresentation,
} from "../brackets/resolution.ts";

export const LIVE_STALE_MS = 45_000;

export type LiveRow = {
  public_ref: string;
  phase: LiveOverlay["phase"];
  score_text: string | null;
  points_text: string | null;
  serving_side: "a" | "b" | null;
  provisional_winner_ref: string | null;
  sequence: number;
  sequence_source: string;
  received_at: string;
  occurred_at?: string | null;
};

export type LiveCell = {
  official: boolean;
  sequence: number | null;
  sequenceSource: string | null;
  occurredAt?: string | null;
};

export type LivePaint = {
  action: "paint" | "skip";
  reason: string | null;
  presentation: MatchSheetPresentation | null;
  provisionalWinnerRef: string | null;
  sequence: number | null;
  sequenceSource: string | null;
  observedAt: string | null;
  occurredAt: string | null;
  /** A live paint never names a parent match. */
  advance: false;
};

export function isLiveStale(
  observedAt: string | null | undefined,
  now: number,
  staleAfterMs = LIVE_STALE_MS
): boolean {
  const ms = observedAt ? Date.parse(observedAt) : NaN;
  if (!Number.isFinite(ms)) return true;
  return now - ms > staleAfterMs;
}

/**
 * One cell. Official sheet wins. An older or equal provider clock does not replace
 * the cell. A snapshot refetch is the current row and may replace what the cell showed.
 */
export function acceptLiveEvent(input: {
  generation: number;
  currentGeneration: number;
  fromSnapshot: boolean;
  cell: LiveCell;
  row: LiveRow;
  now: number;
}): LivePaint {
  const skip = (reason: string): LivePaint => ({
    action: "skip",
    reason,
    presentation: null,
    provisionalWinnerRef: null,
    sequence: input.cell.sequence,
    sequenceSource: input.cell.sequenceSource,
    observedAt: null,
    occurredAt: input.cell.occurredAt ?? null,
    advance: false,
  });

  if (input.generation !== input.currentGeneration) return skip("stale channel");
  if (input.cell.official) return skip("official");
  if (!input.fromSnapshot) {
    const prevClock = clockMs(input.cell.occurredAt);
    const nextClock = clockMs(input.row.occurred_at);
    if (prevClock != null && nextClock != null) {
      if (nextClock < prevClock) return skip("out of order");
      if (nextClock === prevClock) return skip("equal clock");
    } else {
      if (
        input.cell.sequence != null &&
        input.cell.sequenceSource &&
        input.row.sequence_source !== input.cell.sequenceSource
      ) {
        return skip("sequence source changed");
      }
      if (input.cell.sequence != null && input.row.sequence < input.cell.sequence) {
        return skip("out of order");
      }
      if (
        input.cell.sequence != null &&
        input.row.sequence === input.cell.sequence
      ) {
        return skip("duplicate");
      }
    }
  }

  const stale = isLiveStale(input.row.received_at, input.now);
  const presentation = matchSheetPresentation({
    live: {
      phase: input.row.phase,
      scoreText: input.row.score_text,
      pointsText: input.row.points_text,
      servingSide: input.row.serving_side,
      stale,
    },
  });
  return {
    action: "paint",
    reason: null,
    presentation,
    provisionalWinnerRef:
      presentation.state === "provisional" ? input.row.provisional_winner_ref : null,
    sequence: input.row.sequence,
    sequenceSource: input.row.sequence_source,
    observedAt: input.row.received_at,
    occurredAt: input.row.occurred_at ?? null,
    advance: false,
  };
}

function clockMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** A visible tab refetches the current projection and does not replay frames missed while hidden. */
export function resumeLiveTransport(): { dropQueuedEvents: true; refetch: true; replay: false } {
  return { dropQueuedEvents: true, refetch: true, replay: false };
}
