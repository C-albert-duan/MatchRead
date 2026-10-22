/** Browser has not received a successful live update or refetch. The cell label stays `LIVE_STALE_MS`. */
export const LIVE_BROWSER_STALE_MS = 60_000;

/**
 * During play, a quiet transport is delayed once the last success is older than about 60s.
 * The last score stays. This does not clear it.
 */
export function browserLiveDelay(input: {
  lastFreshAt: number | null;
  now: number;
  expectingPlay: boolean;
  staleAfterMs?: number;
}): { delayed: boolean; minutes: number | null } {
  if (!input.expectingPlay || input.lastFreshAt == null) {
    return { delayed: false, minutes: null };
  }
  const age = input.now - input.lastFreshAt;
  const threshold = input.staleAfterMs ?? LIVE_BROWSER_STALE_MS;
  if (!(age > threshold)) return { delayed: false, minutes: null };
  return { delayed: true, minutes: Math.floor(age / 60_000) };
}
