/**
 * How much one match's consequence weighs. Domain fields only.
 * Thresholds are server configuration (docs/v3-m4-decisions.md D-M4-7);
 * these defaults apply until the server supplies its own.
 */

import { compareReasons, type Reason, type ReasonKind, type ReasonParams } from "./consequence";

export type Importance = "normal" | "important" | "critical";

export type ImportanceConfig = {
  /** `critical` needs a flag reason at or under this priority. */
  criticalAtOrBelow: number;
  importantAtOrBelow: number;
};

export const DEFAULT_IMPORTANCE: ImportanceConfig = {
  criticalAtOrBelow: 0,
  importantAtOrBelow: 2,
};

function top(reasons: readonly Reason[]): Reason | null {
  if (!reasons.length) return null;
  return [...reasons].sort(compareReasons)[0];
}

/** `critical` requires a live point flag; a priority alone never reaches it. */
export function classify(
  reasons: readonly Reason[],
  config: ImportanceConfig = DEFAULT_IMPORTANCE
): Importance {
  const first = top(reasons);
  if (!first) return "normal";
  if (first.kind === "flag" && first.prio <= config.criticalAtOrBelow) return "critical";
  if (first.prio <= config.importantAtOrBelow) return "important";
  return "normal";
}

export type MatchConsequence = {
  matchRef: string;
  importance: Importance;
  reason: ReasonKind | null;
  params: ReasonParams;
  ceilingDeltaIfLost: number;
  /** Needs projected standings (deferred). Always null for now. */
  leagueRankIfLost: number | null;
  affectedForwardNodes: string[];
  reasons: Reason[];
};

export function matchConsequence(
  input: {
    matchRef: string;
    reasons: readonly Reason[];
    ceilingDeltaIfLost: number;
    affectedForwardNodes: readonly string[];
  },
  config: ImportanceConfig = DEFAULT_IMPORTANCE
): MatchConsequence {
  const reasons = [...input.reasons].sort(compareReasons);
  const first = reasons[0] ?? null;
  return {
    matchRef: input.matchRef,
    importance: classify(reasons, config),
    reason: first?.kind ?? null,
    params: first?.params ?? {},
    ceilingDeltaIfLost: input.ceilingDeltaIfLost,
    leagueRankIfLost: null,
    affectedForwardNodes: [...input.affectedForwardNodes],
    reasons,
  };
}
