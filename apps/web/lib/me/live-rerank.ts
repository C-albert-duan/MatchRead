/**
 * When a live patch on My Tennis should re-rank the page. Reasons, order, the
 * Stage and Projected depend on a live match only through whether it is live
 * and who leads (`leader`, sets then games), so other ticks change nothing.
 * Re-ranking is a server refresh: the same `assembleMyTennis` runs on the new
 * live row, and the bracket context stays on the server (D-M4-11).
 */
import { leader } from "@matchread/core";

/** What a row's rank can depend on from the live layer. */
export type LiveMark = { live: boolean; lead: "a" | "b" | null };

/** Refreshes at most this often, so a busy match cannot pin the server. */
export const RERANK_MIN_GAP_MS = 5_000;

export function liveMark(live: boolean, sets: string | null | undefined): LiveMark {
  return { live, lead: live ? leader(sets) : null };
}

export function ranksMayChange(previous: LiveMark | undefined, next: LiveMark): boolean {
  const before = previous ?? { live: false, lead: null };
  return before.live !== next.live || before.lead !== next.lead;
}

/** Delay before the next refresh: now if the gap has passed, else the rest of it. */
export function refreshDelay(lastRefreshAt: number | null, now: number): number {
  if (lastRefreshAt == null) return 0;
  return Math.max(0, lastRefreshAt + RERANK_MIN_GAP_MS - now);
}
