/**
 * Domain package — zero runtime dependencies.
 * Scoring: weight doubles each round from 1; naming the champion
 * pays the final weight again. A 128-draw tops out at 512.
 */

/** Round weight: R64=1, R32=2, … Final=64 for a 128 draw (7 rounds before + final). */
export function roundWeight(roundsFromFirst: number): number {
  return 2 ** roundsFromFirst;
}

/**
 * Max points for a full draw of `drawSize` (power of 2).
 * Example: drawSize 128 → 512.
 */
export function maxBracketScore(drawSize: number): number {
  if (drawSize < 2 || (drawSize & (drawSize - 1)) !== 0) {
    throw new Error("drawSize must be a power of 2 >= 2");
  }
  // Matches from R1 through final: drawSize - 1, weights 1,2,4,... plus champion bonus = final weight
  let total = 0;
  let w = 1;
  let matches = drawSize / 2;
  while (matches >= 1) {
    total += matches * w;
    if (matches === 1) {
      total += w; // champion bonus
      break;
    }
    w *= 2;
    matches /= 2;
  }
  return total;
}

export const BRACKET_HEALTH = [
  "Elite",
  "Surviving",
  "Hanging On",
  "In Trouble",
] as const;

export type BracketHealth = (typeof BRACKET_HEALTH)[number];
