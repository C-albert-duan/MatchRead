/**
 * Sheet states for one match cell.
 * Official means a settled result: winner or void.
 * Score text and start time are not status.
 * Live and provisional come from a separate overlay. They never replace
 * an official winner, and they do not advance a later round.
 */
export type MatchSheetState = "official" | "scheduled" | "live" | "provisional";

export type LiveOverlay = {
  phase: "in_play" | "suspended" | "provisional_final";
  scoreText?: string | null;
  pointsText?: string | null;
  servingSide?: "a" | "b" | null;
  stale?: boolean;
};

export type MatchSheetInput = {
  winnerRef?: string | null;
  voided?: boolean;
  officialScore?: string | null;
  live?: LiveOverlay | null;
};

export type MatchSheetPresentation = {
  state: MatchSheetState;
  labelKey: "result.official" | "match.scheduled" | "live.badge" | "live.provisional";
  showScore: string | null;
  servingSide: "a" | "b" | null;
  stale: boolean;
};

/** Provider live score as stored. Points stay beside the set text. */
export function liveScoreLine(
  score: string | null | undefined,
  points: string | null | undefined
): string | null {
  const sets = score?.trim() || "";
  const game = points?.trim() || "";
  if (sets && game) return `${sets} · ${game}`;
  return sets || game || null;
}

/** Set score only. Game points are not part of a provisional finish. */
export function finalLiveScore(score: string | null | undefined): string | null {
  const sets = score?.trim();
  if (!sets) return null;
  return sets.replaceAll(",", " ");
}

/** Where a public seat's name came from. A pick is never a source on the public tree. */
export type SeatSource = "draw" | "stored" | "empty";

/**
 * Pick mark, separate from the sheet state.
 * Open: selected, match not official. Settled: the match is official.
 * A live overlay does not change this mark.
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
  if (result?.live?.phase === "provisional_final") return "provisional";
  if (result?.live?.phase === "in_play" || result?.live?.phase === "suspended") {
    return "live";
  }
  return "scheduled";
}

/** Visible sheet. Official wins over a live overlay. Live score is not an official scoreline. */
export function matchSheetPresentation(
  result: MatchSheetInput | null | undefined
): MatchSheetPresentation {
  const state = matchSheetState(result);
  if (state === "official") {
    return {
      state,
      labelKey: "result.official",
      showScore: result?.officialScore?.trim() || null,
      servingSide: null,
      stale: false,
    };
  }
  if (state === "provisional") {
    return {
      state,
      labelKey: "live.provisional",
      showScore: finalLiveScore(result?.live?.scoreText),
      servingSide: null,
      stale: false,
    };
  }
  if (state === "live") {
    return {
      state,
      labelKey: "live.badge",
      showScore: liveScoreLine(result?.live?.scoreText, result?.live?.pointsText),
      servingSide:
        result?.live?.servingSide === "a" || result?.live?.servingSide === "b"
          ? result.live.servingSide
          : null,
      stale: Boolean(result?.live?.stale),
    };
  }
  return {
    state: "scheduled",
    labelKey: "match.scheduled",
    showScore: null,
    servingSide: null,
    stale: false,
  };
}
