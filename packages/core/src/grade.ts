/**
 * Bracket grading — transcribed from wireframe data.js / scoring notes.
 * Weight doubles each round from 1; naming the champion pays the final weight again.
 * A 128-draw tops out at 512.
 */

import {
  buildRoundStructure,
  matchKey,
  totalMatches,
  type BracketPicks,
} from "./bracket";
import { maxBracketScore, roundWeight } from "./scoring";

export type OfficialMatch = {
  winnerRef: string | null;
  /** Void outranks correct/incorrect — pick neither scores nor misses. */
  voided?: boolean;
};

export type OfficialResults = Record<string, OfficialMatch>;

export type BracketGrade = {
  score: number;
  correct: number;
  incorrect: number;
  voided: number;
  upside: number;
  championRef: string | null;
  championAlive: boolean | null;
  maxScore: number;
};

export { maxBracketScore, roundWeight };

/**
 * Grade picks against official results through the furthest decided round
 * (or `throughRound` if provided).
 */
export function gradeBracket(input: {
  drawSize: number;
  picks: BracketPicks;
  official: OfficialResults;
  throughRound?: number;
}): BracketGrade {
  const { drawSize, picks, official } = input;
  const rounds = buildRoundStructure(drawSize);
  const lastRound = rounds.length - 1;
  const championBonus = roundWeight(lastRound);
  const maxScore = maxBracketScore(drawSize);

  let furthest = -1;
  for (const round of rounds) {
    for (const match of round.matches) {
      const o = official[match.key];
      if (o && (o.voided || o.winnerRef)) {
        furthest = Math.max(furthest, round.index);
      }
    }
  }
  const through =
    input.throughRound !== undefined
      ? Math.min(input.throughRound, lastRound)
      : furthest;

  let score = 0;
  let correct = 0;
  let incorrect = 0;
  let voided = 0;

  for (const round of rounds) {
    if (round.index > through) break;
    const w = roundWeight(round.index);
    for (const match of round.matches) {
      const o = official[match.key];
      const mine = picks[match.key];
      if (!o || (!o.voided && !o.winnerRef) || !mine) continue;
      if (o.voided) {
        voided++;
        continue;
      }
      if (o.winnerRef === mine) {
        score += w;
        correct++;
      } else {
        incorrect++;
      }
    }
  }

  const finalKey = matchKey(lastRound, 0);
  const officialChampion = official[finalKey]?.winnerRef ?? null;
  const myChampion = picks[finalKey] ?? null;
  if (
    officialChampion &&
    myChampion &&
    officialChampion === myChampion &&
    !official[finalKey]?.voided
  ) {
    score += championBonus;
  }

  const alive = computeAlive(drawSize, official, through);

  let upside = 0;
  for (const round of rounds) {
    if (round.index <= through) continue;
    const w = roundWeight(round.index);
    for (const match of round.matches) {
      const pick = picks[match.key];
      if (pick && alive.has(pick)) upside += w;
    }
  }
  if (through < lastRound && myChampion && alive.has(myChampion)) {
    upside += championBonus;
  }

  return {
    score,
    correct,
    incorrect,
    voided,
    upside,
    championRef: myChampion,
    championAlive: myChampion ? alive.has(myChampion) : null,
    maxScore,
  };
}

/**
 * Players still alive after `through` rounds.
 * Alive = winners of the furthest fully-useful frontier: a player who won
 * their latest decided match and has not lost since.
 */
export function computeAlive(
  drawSize: number,
  official: OfficialResults,
  through: number
): Set<string> {
  const rounds = buildRoundStructure(drawSize);
  const alive = new Set<string>();
  if (through < 0) return alive;

  // Collect every winner; remove anyone who lost a later decided match.
  // Loss inference: if match has winner W, and we know both sides from prior
  // official winners (or we only store winners — then loser isn't known).
  // Practical rule for settlement: alive set = winners of matches in `through`
  // that are decided, plus winners of earlier matches whose child isn't decided.
  for (let r = through; r >= 0; r--) {
    for (const match of rounds[r].matches) {
      const o = official[match.key];
      if (!o?.winnerRef || o.voided) continue;
      if (r === through) {
        alive.add(o.winnerRef);
        continue;
      }
      const childKey = matchKey(r + 1, Math.floor(match.indexInRound / 2));
      const child = official[childKey];
      if (!child?.winnerRef && !child?.voided) {
        alive.add(o.winnerRef);
      }
    }
  }

  return alive;
}

/**
 * Season points for one event: round(1000 * score / maxPossible * weight).
 * Slam-class weight = 2; 250-class = 1.
 */
export function seasonPoints(
  score: number,
  maxScore: number,
  weight: number
): number {
  if (maxScore <= 0) return 0;
  return Math.round((1000 * score * weight) / maxScore);
}

export function rankRows<T extends { score: number; tieBreak: string }>(
  rows: T[]
): Array<T & { position: number }> {
  const sorted = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.tieBreak.localeCompare(b.tieBreak);
  });
  return sorted.map((row, i) => ({ ...row, position: i + 1 }));
}

export function expectedPickCount(drawSize: number): number {
  return totalMatches(drawSize);
}
