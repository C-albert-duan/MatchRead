/**
 * League schedule status — one place that decides where an event sits on a
 * league's schedule and whether the commissioner may still change it.
 *
 * `locked` mirrors SQL picks_are_locked: a commissioner lock on the league
 * row, or lock_at passed on an official draw. The database stays the
 * authority; this only decides what the page offers.
 */

export type ScheduleStatus =
  | "upcoming"
  | "drawPending"
  | "open"
  | "inPlay"
  | "completed";

export type ScheduleGroup = "upcoming" | "inPlay" | "completed";

export type ScheduleStatusInput = {
  /** Draw is official (published, seats filled). */
  hasDraw: boolean;
  /** published_at or lock_at is known: the draw is on its way. */
  drawAnnounced: boolean;
  lockAt: string | Date | null | undefined;
  leagueLockedAt?: string | Date | null;
  /** Every match decided, or points already settled. */
  complete: boolean;
  now?: Date;
};

function toTime(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function isScheduleLocked(input: ScheduleStatusInput): boolean {
  if (toTime(input.leagueLockedAt ?? null) != null) return true;
  const lock = toTime(input.lockAt);
  const now = (input.now ?? new Date()).getTime();
  return input.hasDraw && lock != null && lock <= now;
}

export function scheduleStatus(input: ScheduleStatusInput): ScheduleStatus {
  if (input.complete) return "completed";
  if (isScheduleLocked(input)) return "inPlay";
  if (input.hasDraw) return "open";
  if (input.drawAnnounced) return "drawPending";
  return "upcoming";
}

export function scheduleGroup(status: ScheduleStatus): ScheduleGroup {
  if (status === "completed") return "completed";
  if (status === "inPlay") return "inPlay";
  return "upcoming";
}

/** Remove is offered only before lock. */
export function isScheduleEditable(status: ScheduleStatus): boolean {
  return status === "upcoming" || status === "drawPending" || status === "open";
}
