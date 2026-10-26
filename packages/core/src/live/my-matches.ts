/**
 * One ranking for a user's matches, used by the list and by the server and
 * client alike. A total order, so shuffled input gives the same output.
 *
 * Keys: top reason priority, then status (live, scheduled, final), then start
 * time, then match ref. Start time stands in for Heat until Heat exists.
 */

import type { MatchStatus } from "./consequence";

export type RankableMatch = {
  matchRef: string;
  status: MatchStatus;
  /** Priority of the top reason; null when the match has none. */
  topPrio: number | null;
  /** ISO instant; null for a match with no scheduled time. */
  startsAt: string | null;
};

const STATUS_RANK: Record<MatchStatus, number> = { live: 0, scheduled: 1, final: 2 };

function startMs(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

export function compareMyMatches(left: RankableMatch, right: RankableMatch): number {
  const lp = left.topPrio ?? Number.POSITIVE_INFINITY;
  const rp = right.topPrio ?? Number.POSITIVE_INFINITY;
  if (lp !== rp) return lp < rp ? -1 : 1;
  const ls = STATUS_RANK[left.status];
  const rs = STATUS_RANK[right.status];
  if (ls !== rs) return ls - rs;
  const lt = startMs(left.startsAt);
  const rt = startMs(right.startsAt);
  if (lt !== rt) return lt < rt ? -1 : 1;
  if (left.matchRef === right.matchRef) return 0;
  return left.matchRef < right.matchRef ? -1 : 1;
}

export function rankMyMatches<T extends RankableMatch>(items: readonly T[]): T[] {
  return [...items].sort(compareMyMatches);
}
