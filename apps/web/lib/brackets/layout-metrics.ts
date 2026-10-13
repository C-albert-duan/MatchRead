/**
 * Bracket grid spacing contract (R0 rhythm + match metadata foot).
 * Keep in sync with `--match-foot-max` in apps/web/app/globals.css.
 */

export const BRACKET_SEAT_H_PX = 56;
export const BRACKET_PAIR_IN_PX = 10;
export const BRACKET_SLOT_PAD_PX = 8;
export const BRACKET_SLOT_GAP_PX = 48;

/** Line box for `.match-state` / `.match-score` / `.match-when` (11–12px × 1.2). */
export const MATCH_META_LINE_PX = 14.4;

export const MATCH_STATE_TOP_MARGIN_PX = 6;
export const MATCH_LINE_TOP_MARGIN_PX = 2;
export const MATCH_FACT_TOP_MARGIN_PX = 4;

/** `.grade-row` margin + vertical padding + one line of text. */
export const MATCH_GRADE_ROW_PX = 30;

/** `.confidence-row` vertical padding + button height. */
export const MATCH_CONFIDENCE_ROW_PX = 26;

/** `.match-fact` withdrawal line. */
export const MATCH_WITHDRAWAL_LINE_PX =
  MATCH_FACT_TOP_MARGIN_PX + MATCH_META_LINE_PX;

/**
 * Reserved height below the two-player card on round-0 cells.
 * Must fit the tallest metadata stack BracketGrid can render.
 */
export const R0_MATCH_FOOT_MAX_PX = 88;

export function bracketSlotHeightPx(
  seatH = BRACKET_SEAT_H_PX,
  pairIn = BRACKET_PAIR_IN_PX,
  slotPad = BRACKET_SLOT_PAD_PX
): number {
  return seatH * 2 + pairIn + slotPad;
}

export function r0CellHeightPx(
  footMax = R0_MATCH_FOOT_MAX_PX,
  seatH = BRACKET_SEAT_H_PX,
  pairIn = BRACKET_PAIR_IN_PX,
  slotPad = BRACKET_SLOT_PAD_PX
): number {
  return bracketSlotHeightPx(seatH, pairIn, slotPad) + footMax;
}

/** Settled public sheet: Official + score + local time (the original overlap case). */
export function settledOfficialFootStackPx(): number {
  return (
    MATCH_STATE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX +
    MATCH_LINE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX +
    MATCH_LINE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX
  );
}

/** League editor: grade banner + Official + score + time. */
export function gradedEditorFootStackPx(): number {
  return (
    MATCH_GRADE_ROW_PX +
    MATCH_STATE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX +
    MATCH_LINE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX +
    MATCH_LINE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX
  );
}

/** Withdrawal result with score and time. */
export function withdrawalFootStackPx(): number {
  return (
    MATCH_STATE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX +
    MATCH_LINE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX +
    MATCH_WITHDRAWAL_LINE_PX +
    MATCH_LINE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX
  );
}

/** Scheduled-only row (no score) — must still fit. */
export function scheduledFootStackPx(): number {
  return (
    MATCH_STATE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX +
    MATCH_LINE_TOP_MARGIN_PX +
    MATCH_META_LINE_PX
  );
}

/** Vertical span between R0 slot centers (connector elbow math). */
export function r0SlotCenterSpanPx(
  footMax = R0_MATCH_FOOT_MAX_PX,
  slotGap = BRACKET_SLOT_GAP_PX,
  seatH = BRACKET_SEAT_H_PX,
  pairIn = BRACKET_PAIR_IN_PX,
  slotPad = BRACKET_SLOT_PAD_PX
): number {
  return bracketSlotHeightPx(seatH, pairIn, slotPad) + footMax + slotGap;
}
