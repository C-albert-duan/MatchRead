/**
 * Pure live values. No provider field names, no clock reads, no I/O.
 */

import type {
  CanonicalGame,
  CanonicalSet,
  GamePoint,
  LiveFlag,
  LiveMatchState,
  LivePhase,
  LiveStateDraft,
  ServingSide,
} from "./state.ts";

const GAME_POINT: Record<string, GamePoint> = {
  "0": "0",
  "15": "15",
  "30": "30",
  "40": "40",
  A: "AD",
  AD: "AD",
};

const PHASES: readonly LivePhase[] = ["in_play", "suspended", "provisional_final"];

export function isLivePhase(value: string): value is LivePhase {
  return (PHASES as readonly string[]).includes(value);
}

/** Set text is `N-N` parts. Anything else is dropped. */
export function canonicalSets(score: string | null | undefined): CanonicalSet | null {
  if (score == null || score === "") return null;
  const parts = score.split(",");
  if (!parts.length || !parts.every((part) => /^\d+-\d+$/.test(part))) return null;
  return parts.join(",") as CanonicalSet;
}

/** Game points stay `0`, `15`, `30`, `40`, and `AD`. `A` is `AD`. `AD` is not an integer. */
export function canonicalGame(points: string | null | undefined): CanonicalGame | null {
  if (points == null || points === "") return null;
  const parts = points.trim().split("-");
  if (parts.length !== 2) return null;
  const left = GAME_POINT[parts[0]];
  const right = GAME_POINT[parts[1]];
  if (!left || !right) return null;
  return `${left}-${right}`;
}

/** `live` or `provisional` from the live phase. Suspended has no flag. */
export function liveFlag(phase: LivePhase): LiveFlag | null {
  if (phase === "in_play") return "live";
  if (phase === "provisional_final") return "provisional";
  return null;
}

function textOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text ? text : null;
}

/**
 * Rewrite a timestamp the caller already supplied.
 * This does not read the system clock. A missing value stays null.
 */
function instantOrNull(value: string | null | undefined): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function servingOf(value: string | null | undefined): ServingSide | null {
  if (value === "a" || value === "b") return value;
  return null;
}

/**
 * Build one live state from adapter fields.
 * An unknown phase is not a state. Invalid sets or game text become null.
 */
export function normalizeLiveMatchState(draft: LiveStateDraft): LiveMatchState | null {
  const matchId = textOrNull(draft.matchId);
  const tournamentId = textOrNull(draft.tournamentId);
  const publicRef = textOrNull(draft.publicRef);
  const receivedAt = instantOrNull(draft.receivedAt);
  if (!matchId || !tournamentId || !publicRef || !receivedAt) return null;
  if (!isLivePhase(draft.phase)) return null;
  return {
    matchId,
    tournamentId,
    publicRef,
    phase: draft.phase,
    sets: canonicalSets(draft.sets),
    game: canonicalGame(draft.game),
    serving: servingOf(draft.serving),
    flag: liveFlag(draft.phase),
    provisionalWinner: textOrNull(draft.provisionalWinner),
    occurredAt: instantOrNull(draft.occurredAt),
    receivedAt,
  };
}
