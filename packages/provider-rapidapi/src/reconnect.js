/**
 * Waits after a failed provider read.
 * The steps are 1, 2, 4, 8, 15, 30, and 60 seconds.
 * Jitter stays inside ±20% of the step, so the wait cannot collapse to zero.
 * A later attempt stays on 60 seconds.
 */

export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 60_000];

/** Listener and provider freshness. The bracket cell label is a separate constant. */
export const STALE_AFTER_MS = 90_000;

const JITTER = 0.2;

/**
 * @param {number} attempt
 * @param {() => number} [random]
 */
export function reconnectDelayMs(attempt, random = Math.random) {
  const index = Math.max(0, Math.min(RECONNECT_BACKOFF_MS.length - 1, Math.floor(attempt) || 0));
  const base = RECONNECT_BACKOFF_MS[index];
  const unit = Math.min(1, Math.max(0, Number(random()) || 0));
  const span = base * JITTER;
  return Math.round(base - span + unit * span * 2);
}

/**
 * @param {number} attempt
 * @param {boolean} stable
 */
export function nextReconnectAttempt(attempt, stable) {
  if (stable) return 0;
  const current = Math.max(0, Math.floor(attempt) || 0);
  return Math.min(RECONNECT_BACKOFF_MS.length - 1, current + 1);
}

/**
 * @param {number | null} lastSuccessAt
 * @param {number} now
 * @param {number} [staleAfterMs]
 */
export function isProviderStale(lastSuccessAt, now, staleAfterMs = STALE_AFTER_MS) {
  if (lastSuccessAt == null || !Number.isFinite(lastSuccessAt)) return true;
  return now - lastSuccessAt > staleAfterMs;
}
