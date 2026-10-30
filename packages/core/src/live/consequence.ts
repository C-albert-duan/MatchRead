/**
 * Why a match matters to one user. Pure: no I/O, no clock.
 *
 * Reasons carry a kind and parameters, never a sentence; the web tier turns
 * them into copy in every locale. Priority 0 is the most pressing reason in
 * the product, and the list is sorted by ascending priority.
 *
 * A reason whose input is absent is never emitted. Point flags and `swing`
 * reach this function only when the caller has them (see
 * docs/v3-m4-decisions.md D-M4-1 and D-M4-12).
 */

import { buildRoundStructure, matchKey, type BracketPicks } from "../bracket";
import type { LivePointFlags, ServingSide } from "./state";

export type ReasonKind =
  | "flag"
  | "champion"
  | "forward"
  | "swing"
  | "consensus"
  | "daily"
  | "alone"
  | "contrarian"
  | "future";

export type ReasonParams = Readonly<Record<string, string | number | boolean>>;

export type Reason = {
  prio: number;
  kind: ReasonKind;
  params: ReasonParams;
};

export type MatchStatus = "scheduled" | "live" | "final";

/** A match list keeps a row only when its top reason is at or under this priority. */
export const MATTERS_FLOOR = 5;

/** Share at or above which a trailing pick becomes a `consensus` reason. */
export const CONSENSUS_SHARE = 0.6;

/** Share at or below which a pick is `contrarian`. */
export const CONTRARIAN_SHARE = 0.3;

export type ConsequenceMatch = {
  matchKey: string;
  status: MatchStatus;
  sideARef: string | null;
  sideBRef: string | null;
  /** Official winner. Read only when `status` is `final`. */
  winnerRef: string | null;
  /** Who leads as it stands. Read only when `status` is `live`. */
  leader: ServingSide | null;
  pointFlags: LivePointFlags | null;
  /** Share of MatchRead brackets picking each player to win this match, 0..1. */
  pickShare?: Readonly<Record<string, number>>;
  /** Players on which this user is the only member of their league. */
  aloneOn?: ReadonlySet<string>;
  /** The result changes who is first in the bracket's league (`swingsFirstPlace`). */
  swing?: boolean;
};

export type ConsequenceContext = {
  drawSize: number;
  picks: BracketPicks;
  /** Players out of the draw (`eliminatedRefs`). */
  eliminated: ReadonlySet<string>;
};

function other(side: ServingSide): ServingSide {
  return side === "a" ? "b" : "a";
}

function paramsKey(params: ReasonParams): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join("&");
}

/** Ascending priority, then kind, then parameters: a total order. */
export function compareReasons(left: Reason, right: Reason): number {
  if (left.prio !== right.prio) return left.prio - right.prio;
  if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
  const a = paramsKey(left.params);
  const b = paramsKey(right.params);
  return a === b ? 0 : a < b ? -1 : 1;
}

export function reasonsFor(match: ConsequenceMatch, ctx: ConsequenceContext): Reason[] {
  const at = /^r(\d+)-m(\d+)$/.exec(match.matchKey);
  if (!at) return [];
  const round = Number(at[1]);
  const index = Number(at[2]);
  const lastRound = buildRoundStructure(ctx.drawSize).length - 1;
  if (round > lastRound) return [];

  const refOf = (side: ServingSide) => (side === "a" ? match.sideARef : match.sideBRef);
  const sideOf = (ref: string | null | undefined): ServingSide | null => {
    if (!ref) return null;
    if (ref === match.sideARef) return "a";
    if (ref === match.sideBRef) return "b";
    return null;
  };
  const live = match.status === "live";
  const flags = live ? match.pointFlags : null;
  const flagAgainst = (side: ServingSide): "match-point" | "break-point" | null => {
    if (flags?.matchPoint === other(side)) return "match-point";
    if (flags?.breakPoint === other(side)) return "break-point";
    return null;
  };
  const flagFor = (side: ServingSide): "match-point" | "break-point" | null => {
    if (flags?.matchPoint === side) return "match-point";
    if (flags?.breakPoint === side) return "break-point";
    return null;
  };
  const pressed = (side: ServingSide) =>
    live && (match.leader === other(side) || flagAgainst(side) != null);
  const lost = (side: ServingSide) =>
    match.status === "final" && match.winnerRef != null && match.winnerRef !== refOf(side);
  const share = (ref: string) => match.pickShare?.[ref];

  const reasons: Reason[] = [];
  const add = (prio: number, kind: ReasonKind, params: ReasonParams) =>
    reasons.push({ prio, kind, params });

  const mine = ctx.picks[match.matchKey];
  const mySide = sideOf(mine);
  if (mine && mySide) {
    const against = flagAgainst(mySide);
    if (against) add(0, "flag", { flag: against, against: true, playerRef: mine });
    const forMe = flagFor(mySide);
    if (forMe) add(3, "flag", { flag: forMe, against: false, playerRef: mine });
    const pct = share(mine);
    if (live && match.leader === other(mySide) && pct != null && pct >= CONSENSUS_SHARE) {
      add(3, "consensus", { playerRef: mine, sharePct: Math.round(pct * 100) });
    }
    if (match.status !== "final" && match.aloneOn?.has(mine)) {
      add(4, "alone", { playerRef: mine });
    }
    if (match.status !== "final" && pct != null && pct <= CONTRARIAN_SHARE) {
      add(5, "contrarian", { playerRef: mine, sharePct: Math.round(pct * 100) });
    }
  }

  const champion = ctx.picks[matchKey(lastRound, 0)];
  const championSide = sideOf(champion);
  let championCovered = false;
  if (champion && championSide) {
    if (lost(championSide)) {
      add(1, "champion", { state: "out", playerRef: champion });
      championCovered = true;
    } else if (pressed(championSide)) {
      add(1, "champion", { state: "pressure", playerRef: champion });
      championCovered = true;
    } else if (live) {
      add(2, "champion", { state: "on-court", playerRef: champion });
      championCovered = true;
    }
  }

  for (const side of ["a", "b"] as const) {
    const ref = refOf(side);
    if (!ref || (championCovered && ref === champion)) continue;
    const named = Object.entries(ctx.picks).some(([key, pick]) => {
      if (pick !== ref) return false;
      const pickAt = /^r(\d+)-m\d+$/.exec(key);
      return pickAt != null && Number(pickAt[1]) >= round;
    });
    if (!named) continue;
    if (lost(side)) add(2, "forward", { state: "eliminated", playerRef: ref });
    else if (pressed(side)) add(2, "forward", { state: "pressure", playerRef: ref });
    else if (match.status !== "final") add(6, "forward", { state: "open", playerRef: ref });
  }

  if (match.status !== "final" && match.swing === true) add(3, "swing", {});

  if (round < lastRound && match.status !== "final") {
    const sibling = ctx.picks[matchKey(round, index ^ 1)];
    if (sibling && !ctx.eliminated.has(sibling) && sideOf(sibling) == null) {
      add(6, "future", { playerRef: sibling, round: round + 1 });
    }
  }

  const seen = new Set<string>();
  return reasons
    .filter((reason) => {
      const key = `${reason.prio}|${reason.kind}|${paramsKey(reason.params)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareReasons);
}

/** True when the top reason clears `MATTERS_FLOOR`. */
export function matters(reasons: readonly Reason[]): boolean {
  return reasons.length > 0 && reasons[0].prio <= MATTERS_FLOOR;
}
