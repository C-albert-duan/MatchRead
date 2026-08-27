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

  const startDay = input.main_draw_starts_on || input.starts_on;
  const startMs = startDay
    ? Date.parse(`${String(startDay).slice(0, 10)}T12:00:00Z`)
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
 * Force-poll unpublished events within 5 days of main-draw / start.
 */
export function shouldPollDraw(input = {}) {
  const now = (input.now ?? new Date()).getTime();
  const hasDraw = Boolean(input.hasDraw);

  if (!hasDraw) {
    const day =
      input.main_draw_starts_on || input.starts_on
        ? String(input.main_draw_starts_on || input.starts_on).slice(0, 10)
        : null;
    if (day) {
      const startMs = Date.parse(`${day}T12:00:00Z`);
      if (!Number.isNaN(startMs)) {
        const until = startMs - now;
        // From 5 days before main draw through 2 days after — always poll.
        if (until < 5 * HOUR * 24 && until > -2 * HOUR * 24) return true;
      }
    }
  }

  const interval = drawPollIntervalMs(input);
  const checked = input.draw_checked_at
    ? Date.parse(input.draw_checked_at)
    : NaN;
  if (Number.isNaN(checked)) return true;
  return now - checked >= interval;
}
