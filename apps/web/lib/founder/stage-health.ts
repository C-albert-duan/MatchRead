/**
 * Founder signals for the My Tennis Stage and the settlement latch.
 * A Stage that changes state more than twice per user-hour is the S2 event
 * mark. Any winner conflict (a later official winner that differs from the
 * latched one) is the S1 error mark; users never see it.
 */
import type { HealthLevel } from "./live-health.ts";

export const STAGE_EVENTS_PER_USER_HOUR_ALARM = 2;

export type StageRates = { events: number; users: number; maxPerUserHour: number };

export type StageHealth = {
  stage: (StageRates & { level: HealthLevel }) | null;
  /** Null when the count could not be read. */
  winnerConflicts: { count: number | null; level: HealthLevel };
};

function count(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/** One row from stage_event_rates(); bigint columns may arrive as strings. */
export function stageRatesFrom(row: unknown): StageRates | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return {
    events: count(record.events),
    users: count(record.users),
    maxPerUserHour: count(record.max_per_user_hour),
  };
}

export function founderStageHealth(input: {
  rates: StageRates | null;
  winnerConflicts: number | null;
}): StageHealth {
  return {
    stage: input.rates
      ? {
          ...input.rates,
          level:
            input.rates.maxPerUserHour > STAGE_EVENTS_PER_USER_HOUR_ALARM ? "event" : "ok",
        }
      : null,
    winnerConflicts: {
      count: input.winnerConflicts,
      level: input.winnerConflicts != null && input.winnerConflicts > 0 ? "error" : "ok",
    },
  };
}
