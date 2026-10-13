/**
 * Sheet state for one match cell.
 * Official means a settled result: winner or void.
 * Score text and start time are not status.
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
