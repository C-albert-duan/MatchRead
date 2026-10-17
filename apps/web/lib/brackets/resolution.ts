/**
 * Closed sheet states for one match cell.
 * Official means a settled result: winner or void.
 * Score text and start time are not status.
 *
 * M3 extends this union here when a real sheet field exists:
 * `live` and `flagged` for a match in progress, `provisional` for an
 * unfinished final. Those members are not part of the type yet, so no
 * renderer branches on them. Do not add a live table or sample rows
 * in order to invent them.
 */
export type MatchSheetState = "official" | "scheduled";

export type MatchSheetInput = {
  winnerRef?: string | null;
  voided?: boolean;
  officialScore?: string | null;
};

export type MatchSheetPresentation = {
  state: MatchSheetState;
  labelKey: "result.official" | "match.scheduled";
  showScore: string | null;
};

/** Where a public seat's name came from. A pick is never a source on the public tree. */
export type SeatSource = "draw" | "stored" | "empty";

/**
 * Pick mark, separate from the sheet state.
 * Open: selected, match not official. Settled: the match is official.
 * A later in-progress pick mark extends this union the same way as
 * MatchSheetState. This function does not assign it.
 */
export type PickHighlight = "open" | "settled";

export function pickHighlight(
  chosen: boolean,
  official: boolean
): PickHighlight | null {
  if (!chosen) return null;
  return official ? "settled" : "open";
}

export type NodeSchedule = {
  scheduledAt: string | null;
  hasTime: boolean;
  session: "day" | "night" | null;
  court: string | null;
  /** No stored instant. The caption is the TBA label. */
  timeTba: boolean;
};

export function presentNodeSchedule(
  row:
    | {
        scheduled_at?: string | null;
        has_time?: boolean;
        session?: string | null;
        court?: string | null;
      }
    | null
    | undefined
): NodeSchedule {
  const scheduledAt = row?.scheduled_at?.trim() || null;
  const session =
    row?.session === "day" || row?.session === "night" ? row.session : null;
  return {
    scheduledAt,
    hasTime: Boolean(scheduledAt && row?.has_time),
    session,
    court: row?.court?.trim() || null,
    timeTba: !scheduledAt,
  };
}

/** Winner mark only when the settled ref is one of this node's sides. */
export function officialWinnerRef(
  result: MatchSheetInput | null | undefined,
  sideRefs: Array<string | null | undefined>
): string | null {
  if (!result || result.voided || !result.winnerRef) return null;
  return sideRefs.includes(result.winnerRef) ? result.winnerRef : null;
}

export function matchSheetState(
  result: MatchSheetInput | null | undefined
): MatchSheetState {
  if (result?.voided || result?.winnerRef) return "official";
  return "scheduled";
}

/** Visible sheet: state, label, and score only when the result is official. */
export function matchSheetPresentation(
  result: MatchSheetInput | null | undefined
): MatchSheetPresentation {
  const state = matchSheetState(result);
  const score = result?.officialScore?.trim() || null;
  return {
    state,
    labelKey: state === "official" ? "result.official" : "match.scheduled",
    showScore: state === "official" ? score : null,
  };
}
