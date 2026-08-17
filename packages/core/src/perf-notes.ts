/**
 * Slam / US Open window — draw topology & scoring smoke targets.
 *
 * - Horizontal scroll on `.bracket-region` is the MVP path for 128
 * - Row virtualization is optional if low-end paint/jank shows up
 *
 * Invariants (also asserted by scripts/verify-settlement-math.mjs):
 * - maxBracketScore(128) === 512
 * - buildRoundStructure(128).length === 7  (R128 … Final)
 */

/** Men's/women's singles slam draw size. */
export const SLAM_DRAW_SIZE = 128 as const;

/** Round columns for a slam draw (Round of 128 … Final). */
export const SLAM_ROUND_COUNT = 7 as const;

/** Perfect bracket score for SLAM_DRAW_SIZE. */
export const SLAM_MAX_SCORE = 512 as const;
