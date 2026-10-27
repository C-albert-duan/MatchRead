/**
 * When a live patch on My Tennis should re-rank the page. Reasons, order, the
 * Stage and Projected depend on a live match only through whether it is live,
 * who leads (`leader`, sets then games) and who holds match point, so other
 * ticks change nothing.
 * Re-ranking is a server refresh: the same `assembleMyTennis` runs on the new
 * live row, and the bracket context stays on the server (D-M4-11).
 */
import { derivePointFlags, leader, type SetsToWin } from "@matchread/core";

/**
 * What a row's rank can depend on from the live layer. `setsToWin` is the
 * match format the server ranked with, carried so the client can re-derive
 * match point from a patch.
 */
export type LiveMark = {
  live: boolean;
  lead: "a" | "b" | null;
  matchPoint: "a" | "b" | null;
  setsToWin: SetsToWin | null;
};

/** Refreshes at most this often, so a busy match cannot pin the server. */
export const RERANK_MIN_GAP_MS = 5_000;

export function liveMark(
  live: boolean,
  sets: string | null | undefined,
  game: string | null | undefined = null,
  setsToWin: SetsToWin | null = null
): LiveMark {
  const flags = live
    ? derivePointFlags({
        oriented: true,
        sets: sets ?? null,
        game: game ?? null,
        serving: null,
        setsToWin,
      })
    : null;
  return {
    live,
    lead: live ? leader(sets) : null,
    matchPoint: flags?.matchPoint ?? null,
    setsToWin,
  };
}

export function ranksMayChange(previous: LiveMark | undefined, next: LiveMark): boolean {
  const before = previous ?? { live: false, lead: null, matchPoint: null };
  return (
    before.live !== next.live || before.lead !== next.lead || before.matchPoint !== next.matchPoint
  );
}

/** Delay before the next refresh: now if the gap has passed, else the rest of it. */
export function refreshDelay(lastRefreshAt: number | null, now: number): number {
  if (lastRefreshAt == null) return 0;
  return Math.max(0, lastRefreshAt + RERANK_MIN_GAP_MS - now);
}
