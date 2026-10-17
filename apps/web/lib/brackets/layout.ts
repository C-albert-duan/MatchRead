import type { CSSProperties } from "react";

/**
 * Desktop slot position from draw topology.
 * Round 0 is a fixed pitch. Each later slot sits on the midpoint of its two feeders.
 * `2 ** round` is the number of first-round matches that feed this slot.
 */
export function matchSlotTopUnits(round: number, indexInRound: number): number {
  const span = 2 ** round;
  return indexInRound * span + span / 2 - 0.5;
}

/**
 * Earliest round that still has a match without an official result.
 * The last round when every match is official.
 */
export function relevantRoundIndex(
  matches: Array<{ round: number; official: boolean }>
): number {
  if (matches.length === 0) return 0;
  const complete = new Map<number, boolean>();
  for (const match of matches) {
    const prior = complete.get(match.round);
    complete.set(match.round, (prior ?? true) && match.official);
  }
  const rounds = [...complete.keys()].sort((a, b) => a - b);
  for (const round of rounds) {
    if (!complete.get(round)) return round;
  }
  return rounds[rounds.length - 1] ?? 0;
}

/** Even index feeds the parent's first side. Decorative only; it does not place a winner. */
export function connectorPair(indexInRound: number): "a" | "b" {
  return indexInRound % 2 === 0 ? "a" : "b";
}

export function matchSlotVars(round: number, indexInRound: number): CSSProperties {
  return {
    ["--slot-top"]: String(matchSlotTopUnits(round, indexInRound)),
    ["--round-span"]: String(2 ** round),
  } as CSSProperties;
}

