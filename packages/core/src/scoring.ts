/** Scoring weights — shared by maxBracketScore and gradeBracket. */

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
