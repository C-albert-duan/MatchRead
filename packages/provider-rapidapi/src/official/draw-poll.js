/**
 * Adaptive draw poll interval (ms) — no hard-coded ceremony hour.
 * Faster near lock / start and when Q-TBD seats remain unnamed.
 */

const HOUR = 3_600_000;
const MIN = 60_000;

/**
 * @param {{
 *   now?: Date,
 *   lock_at?: string | null,
 *   starts_on?: string | null,
 *   hasDraw?: boolean,
 *   tbdCount?: number,
 * }} input
 * @returns {number} suggested poll interval ms
 */
export function drawPollIntervalMs(input = {}) {
  const now = input.now ?? new Date();
  const tbd = Number(input.tbdCount) || 0;
  if (tbd > 0) return 5 * MIN;

  const lockMs = input.lock_at ? Date.parse(input.lock_at) : NaN;
  if (!Number.isNaN(lockMs)) {
    const untilLock = lockMs - now.getTime();
    if (untilLock > 0 && untilLock < 48 * HOUR) return 10 * MIN;
    if (untilLock > 0 && untilLock < 7 * 24 * HOUR) return 30 * MIN;
  }

  const startMs = input.starts_on
    ? Date.parse(`${String(input.starts_on).slice(0, 10)}T12:00:00Z`)
    : NaN;
  if (!Number.isNaN(startMs)) {
    const untilStart = startMs - now.getTime();
    if (untilStart > 0 && untilStart < 72 * HOUR && !input.hasDraw) {
      return 15 * MIN;
    }
  }

  if (!input.hasDraw) return 60 * MIN;
  return 6 * HOUR;
}

/**
 * Whether this sync tick should poll /draws for the event.
 * Uses draw_checked_at vs adaptive interval.
 */
export function shouldPollDraw(input = {}) {
  const interval = drawPollIntervalMs(input);
  const checked = input.draw_checked_at
    ? Date.parse(input.draw_checked_at)
    : NaN;
  if (Number.isNaN(checked)) return true;
  const now = (input.now ?? new Date()).getTime();
  return now - checked >= interval;
}
