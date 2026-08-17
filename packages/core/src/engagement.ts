/**
 * CEO Tier 1 engagement helpers — health, miss, perfect remaining, highlights.
 * Deterministic; no AI. Grading stays in grade.ts.
 */

import {
  buildRoundStructure,
  isNamedPlayerSeat,
  type BracketPicks,
  type DrawSeat,
} from "./bracket";
import {
  computeAlive,
  type BracketGrade,
  type OfficialResults,
} from "./grade";
import { roundWeight } from "./scoring";

export const BRACKET_HEALTH = [
  "Elite",
  "Surviving",
  "Hanging On",
  "In Trouble",
] as const;

export type BracketHealth = (typeof BRACKET_HEALTH)[number];

export type BiggestMiss = {
  matchKey: string;
  weight: number;
  playerRef: string;
};

export type HighlightLabel =
  | "Biggest Climber"
  | "Biggest Collapse"
  | "Upset King"
  | "Cold Streak";

export type HighlightRow = {
  userId: string;
  positionDelta: number | null;
  correct: number;
  incorrect: number;
};

export type LeagueHighlight = {
  label: HighlightLabel;
  userId: string;
};

/**
 * Ceiling-based health while the draw is live; score-share when upside is gone.
 * Champion-out caps Elite during live play.
 */
export function bracketHealth(input: {
  score: number;
  maxScore: number;
  upside: number;
  championAlive: boolean | null;
}): BracketHealth {
  const { score, maxScore, upside, championAlive } = input;
  const pct = maxScore > 0 ? score / maxScore : 0;
  const ceiling = maxScore > 0 ? (score + upside) / maxScore : 0;

  // Nothing left to play for — grade the finished bracket, not a dead ceiling.
  if (upside <= 0) {
    if (pct >= 0.75) return "Elite";
    if (pct >= 0.5) return "Surviving";
    if (pct >= 0.25) return "Hanging On";
    return "In Trouble";
  }

  if (championAlive === false) {
    if (ceiling >= 0.5) return "Surviving";
    if (ceiling >= 0.25) return "Hanging On";
    return "In Trouble";
  }

  if (ceiling >= 0.75) return "Elite";
  if (ceiling >= 0.5) return "Surviving";
  if (ceiling >= 0.25) return "Hanging On";
  return "In Trouble";
}

/**
 * Highest-weight incorrect non-void pick. Ties: later round, then lower match index.
 */
export function biggestMiss(input: {
  picks: BracketPicks;
  official: OfficialResults;
  drawSize: number;
}): BiggestMiss | null {
  const { picks, official, drawSize } = input;
  const rounds = buildRoundStructure(drawSize);
  let best: BiggestMiss | null = null;

  for (const round of rounds) {
    const w = roundWeight(round.index);
    for (const match of round.matches) {
      const o = official[match.key];
      const mine = picks[match.key];
      if (!o || o.voided || !o.winnerRef || !mine) continue;
      if (o.winnerRef === mine) continue;

      const candidate: BiggestMiss = {
        matchKey: match.key,
        weight: w,
        playerRef: mine,
      };
      if (
        !best ||
        candidate.weight > best.weight ||
        (candidate.weight === best.weight &&
          candidate.matchKey > best.matchKey)
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

/**
 * Undecided matches where the pick is still alive (has not been eliminated).
 * When nothing is decided, seats (or all pick refs) seed the alive set.
 */
export function perfectPicksRemaining(input: {
  picks: BracketPicks;
  official: OfficialResults;
  drawSize: number;
  seats?: Pick<DrawSeat, "player_id" | "kind" | "last_name">[];
}): number {
  const { picks, official, drawSize, seats } = input;
  const rounds = buildRoundStructure(drawSize);

  let through = -1;
  for (const round of rounds) {
    for (const match of round.matches) {
      const o = official[match.key];
      if (o && (o.voided || o.winnerRef)) {
        through = Math.max(through, round.index);
      }
    }
  }

  let alive: Set<string>;
  if (through < 0) {
    alive = new Set();
    if (seats && seats.length > 0) {
      for (const s of seats) {
        if (isNamedPlayerSeat(s) && s.player_id) alive.add(s.player_id);
      }
    } else {
      for (const ref of Object.values(picks)) {
        if (ref) alive.add(ref);
      }
    }
  } else {
    alive = computeAlive(drawSize, official, through);
  }

  let count = 0;
  for (const round of rounds) {
    for (const match of round.matches) {
      const o = official[match.key];
      if (o && (o.voided || o.winnerRef)) continue;
      const pick = picks[match.key];
      if (pick && alive.has(pick)) count++;
    }
  }
  return count;
}

/** Brackets with zero incorrect picks so far. */
export function countPerfectBrackets(
  grades: Array<Pick<BracketGrade, "incorrect">>
): number {
  return grades.filter((g) => g.incorrect === 0).length;
}

/**
 * Deterministic highlight labels. One member per label; ties → first by userId.
 * Same member may hold multiple labels. Needs at least two members — a solo
 * league naming you Upset King and Cold Streak is noise.
 */
export function leagueHighlights(rows: HighlightRow[]): LeagueHighlight[] {
  if (rows.length < 2) return [];

  const byUserId = (a: HighlightRow, b: HighlightRow) =>
    a.userId.localeCompare(b.userId);

  function pickMax(
    score: (r: HighlightRow) => number | null
  ): HighlightRow | null {
    let best: HighlightRow | null = null;
    let bestScore = -Infinity;
    const sorted = [...rows].sort(byUserId);
    for (const row of sorted) {
      const s = score(row);
      if (s == null || Number.isNaN(s)) continue;
      if (s > bestScore) {
        bestScore = s;
        best = row;
      }
    }
    return best;
  }

  function pickMin(
    score: (r: HighlightRow) => number | null
  ): HighlightRow | null {
    let best: HighlightRow | null = null;
    let bestScore = Infinity;
    const sorted = [...rows].sort(byUserId);
    for (const row of sorted) {
      const s = score(row);
      if (s == null || Number.isNaN(s)) continue;
      if (s < bestScore) {
        bestScore = s;
        best = row;
      }
    }
    return best;
  }

  const out: LeagueHighlight[] = [];

  const climber = pickMax((r) => r.positionDelta);
  if (climber && (climber.positionDelta ?? 0) > 0) {
    out.push({ label: "Biggest Climber", userId: climber.userId });
  }

  const collapse = pickMin((r) => r.positionDelta);
  if (collapse && (collapse.positionDelta ?? 0) < 0) {
    out.push({ label: "Biggest Collapse", userId: collapse.userId });
  }

  const upset = pickMax((r) => r.correct);
  if (upset) {
    out.push({ label: "Upset King", userId: upset.userId });
  }

  const cold = pickMax((r) => r.incorrect);
  if (cold && cold.incorrect > 0) {
    out.push({ label: "Cold Streak", userId: cold.userId });
  }

  return out;
}

/** Confidence map: matchKey → 1–5. */
export type BracketConfidence = Record<string, number>;

export function clampConfidence(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}
