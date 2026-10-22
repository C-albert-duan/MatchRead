/**
 * Realtime loss recovery.
 * Retry with backoff, then poll the current projection about every 30 seconds.
 * The cell stale label stays `LIVE_STALE_MS` and is not this schedule.
 */

export const LIVE_POLL_MS = 30_000;

/** Waits before another subscribe. After these, recovery polls. */
export const LIVE_RETRY_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;

export type RealtimeRecovery = {
  waitMs: number;
  mode: "retry" | "poll";
};

export function isRealtimeLoss(status: string): boolean {
  return status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED" || status === "offline";
}

/** Attempt 0 is the first retry. Once the retry steps are used, the wait is the poll interval. */
export function nextRealtimeRecovery(attempt: number): RealtimeRecovery {
  const index = Math.max(0, Math.floor(attempt) || 0);
  if (index < LIVE_RETRY_MS.length) {
    return { waitMs: LIVE_RETRY_MS[index], mode: "retry" };
  }
  return { waitMs: LIVE_POLL_MS, mode: "poll" };
}

/**
 * One loss arms the next wait. A loss while that wait is pending does not stack another.
 * A later success resets `failures` so the next loss starts at the first backoff.
 */
export function armRealtimeRecovery(input: {
  failures: number;
  waiting: boolean;
}): { arm: false } | { arm: true; failures: number; step: RealtimeRecovery } {
  if (input.waiting) return { arm: false };
  const failures = Math.max(0, Math.floor(input.failures) || 0);
  return { arm: true, failures: failures + 1, step: nextRealtimeRecovery(failures) };
}
