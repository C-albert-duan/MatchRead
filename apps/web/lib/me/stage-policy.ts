/**
 * The My Tennis Stage: which state, and what it shows. Presentation policy,
 * kept out of packages/core on purpose.
 *
 * State order follows the plan: cascade, urgent, live, morning, reckoning,
 * next. `cascade` and `urgent` exist in the type but are not rendered in M4;
 * STAGE_TREATMENT maps them onto calm treatments, so enabling them later is
 * a client change with no core deploy.
 */
import type { MyMatchRow, MyTennisTriad, MyTennisView } from "./my-tennis.ts";

export type StageState = "cascade" | "urgent" | "live" | "morning" | "next" | "reckoning" | "empty";

export type StageTreatment = "morning" | "live" | "next" | "reckoning" | "empty";

export const STAGE_TREATMENT: Record<StageState, StageTreatment> = {
  cascade: "next",
  urgent: "live",
  live: "live",
  morning: "morning",
  next: "next",
  reckoning: "reckoning",
  empty: "empty",
};

/** Window for "your matches" in the morning facts. A duration, so no zone. */
export const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;

export function stageState(rows: readonly MyMatchRow[], cascadeOpen = false): StageState {
  if (cascadeOpen) return "cascade";
  if (!rows.length) return "empty";
  if (rows[0].consequence.importance === "critical") return "urgent";
  if (rows.some((row) => row.status === "live")) return "live";
  if (rows.every((row) => row.status === "scheduled")) return "morning";
  if (rows.every((row) => row.status === "final")) return "reckoning";
  return "next";
}

export type StageModel = {
  state: StageState;
  treatment: StageTreatment;
  /** live: the most relevant live match. next: the most pressing settled one. */
  focus: MyMatchRow | null;
  /** The user's next scheduled match: earliest published clock, else first ranked. */
  upNext: MyMatchRow | null;
  triad: MyTennisTriad | null;
  facts: {
    upcoming: number;
    tournaments: number;
    banked: number;
    ceiling: number;
  };
  reckoning: {
    banked: number;
    ceiling: number;
    settled: number;
    lost: number;
  };
};

function instant(row: MyMatchRow): number | null {
  if (!row.hasTime || !row.startsAt) return null;
  const ms = Date.parse(row.startsAt);
  return Number.isNaN(ms) ? null : ms;
}

function nextScheduled(rows: readonly MyMatchRow[], now: number): MyMatchRow | null {
  const scheduled = rows.filter((row) => row.status === "scheduled");
  const timed = scheduled
    .map((row) => ({ row, at: instant(row) }))
    .filter((item): item is { row: MyMatchRow; at: number } => item.at != null && item.at >= now)
    .sort((a, b) => a.at - b.at || (a.row.matchRef < b.row.matchRef ? -1 : 1));
  return timed[0]?.row ?? scheduled[0] ?? null;
}

function triadFor(view: MyTennisView, row: MyMatchRow | null): MyTennisTriad | null {
  if (row) {
    const own = view.triads.find(
      (triad) => triad.tournamentRef === row.tournamentRef && triad.leagueId === row.leagueId
    );
    if (own) return own;
  }
  return view.triads[0] ?? null;
}

function isLost(row: MyMatchRow): boolean {
  return row.consequence.reasons.some(
    (reason) =>
      (reason.kind === "forward" || reason.kind === "champion") &&
      (reason.params.state === "eliminated" || reason.params.state === "out")
  );
}

export function stageModel(view: MyTennisView, now: Date, cascadeOpen = false): StageModel {
  const rows = view.rows;
  const state = stageState(rows, cascadeOpen);
  const treatment = STAGE_TREATMENT[state];
  const nowMs = now.getTime();

  const focus =
    treatment === "live"
      ? rows.find((row) => row.status === "live") ?? rows[0] ?? null
      : treatment === "next"
        ? rows.find((row) => row.status === "final") ?? null
        : null;
  const upNext = nextScheduled(rows, nowMs);
  const triad = triadFor(view, focus ?? upNext ?? rows[0] ?? null);

  const upcoming = rows.filter((row) => {
    if (row.status === "live") return true;
    if (row.status !== "scheduled") return false;
    const at = instant(row);
    return at != null && at >= nowMs && at - nowMs <= UPCOMING_WINDOW_MS;
  }).length;
  const totals = triad ?? { banked: 0, ceiling: 0 };

  return {
    state,
    treatment,
    focus,
    upNext,
    triad,
    facts: {
      upcoming,
      tournaments: new Set(rows.map((row) => row.tournamentRef)).size,
      banked: totals.banked,
      ceiling: totals.ceiling,
    },
    reckoning: {
      banked: totals.banked,
      ceiling: totals.ceiling,
      settled: rows.filter((row) => row.status === "final").length,
      lost: rows.filter(isLost).length,
    },
  };
}
