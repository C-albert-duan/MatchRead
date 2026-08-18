export const DAY_MS = 86_400_000;

/** Rough in-play window after start (On court / live chip). */
export const IN_PLAY_DAYS = 14;

export type StatusTournament = {
  hasDraw: boolean;
  starts_on: string | null;
  lock_at: string | null;
  admin_locked_at?: string | null;
};

export type CalendarStatus =
  | "drawPending"
  | "open"
  | "locked"
  | "live"
  | "complete";

export function eventMoment(row: Pick<StatusTournament, "starts_on" | "lock_at">): Date | null {
  if (row.starts_on) {
    const d = new Date(`${row.starts_on}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (row.lock_at) {
    const d = new Date(row.lock_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function daysFromStart(
  row: Pick<StatusTournament, "starts_on" | "lock_at">,
  now: Date
): number | null {
  const start = eventMoment(row);
  if (!start) return null;
  return (now.getTime() - start.getTime()) / DAY_MS;
}

export function isEntryLocked(
  row: Pick<StatusTournament, "lock_at" | "admin_locked_at"> & {
    hasDraw?: boolean;
  },
  now: Date = new Date()
) {
  if (row.admin_locked_at) return true;
  if (row.hasDraw === false) return false;
  if (!row.lock_at) return false;
  return new Date(row.lock_at).getTime() <= now.getTime();
}

/**
 * Entry is fillable: verified draw exists, lock has not passed, and the
 * event is not past the in-play window (finished calendars are never open).
 */
export function isEntryOpen(
  row: StatusTournament,
  now: Date = new Date()
) {
  return row.hasDraw && !isEntryLocked(row, now) && !isComplete(row, now);
}

/**
 * Tournament week is underway (starts_on reached, within the in-play window).
 * Independent of whether a draw exists.
 */
export function isInPlay(
  row: Pick<StatusTournament, "starts_on" | "lock_at">,
  now: Date = new Date()
) {
  const age = daysFromStart(row, now);
  if (age == null) return false;
  return age >= 0 && age <= IN_PLAY_DAYS;
}

export function isComplete(
  row: Pick<StatusTournament, "starts_on" | "lock_at">,
  now: Date = new Date()
) {
  const age = daysFromStart(row, now);
  if (age == null) return false;
  return age > IN_PLAY_DAYS;
}

/**
 * On court: published draw is locked and the event has started
 * (starts_on reached, or lock_at / admin lock already fired).
 */
export function isOnCourt(
  row: StatusTournament,
  now: Date = new Date()
): boolean {
  if (!row.hasDraw) return false;
  if (isComplete(row, now)) return false;
  if (!isEntryLocked(row, now)) return false;
  if (isInPlay(row, now)) return true;
  // Locked via lock_at / admin before the calendar start day still counts
  // as started for the bracket-view bucket.
  return Boolean(row.admin_locked_at) || Boolean(row.lock_at);
}

/**
 * Label for a calendar / public-page status chip.
 * On court only when there is a locked published draw — never for bare calendar rows.
 */
export function calendarStatus(
  row: StatusTournament,
  now: Date = new Date()
): CalendarStatus {
  if (isComplete(row, now)) return "complete";
  if (isOnCourt(row, now)) return "live";
  if (!row.hasDraw) return "drawPending";
  if (isEntryLocked(row, now)) return "locked";
  return "open";
}

export function calendarStatusMessageKey(
  status: CalendarStatus
):
  | "league.status.drawPending"
  | "calendar.open"
  | "tournament.locked"
  | "calendar.onCourt"
  | "league.status.complete" {
  switch (status) {
    case "drawPending":
      return "league.status.drawPending";
    case "open":
      return "calendar.open";
    case "locked":
      return "tournament.locked";
    case "live":
      return "calendar.onCourt";
    case "complete":
      return "league.status.complete";
  }
}

/** Locale-aware remaining time. Null once the instant has passed. */
export function formatCountdown(
  target: string | Date,
  locale: string,
  now: Date = new Date()
): string | null {
  const at = target instanceof Date ? target : new Date(target);
  if (Number.isNaN(at.getTime())) return null;
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return null;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return rtf.format(Math.max(mins, 1), "minute");
  const hours = Math.round(mins / 60);
  if (hours < 48) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
}

export function startInstant(startsOn: string | null): Date | null {
  if (!startsOn) return null;
  const d = new Date(`${startsOn}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
