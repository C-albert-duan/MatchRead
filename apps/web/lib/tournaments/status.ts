export const DAY_MS = 86_400_000;

/** Fallback in-play window after start when ends_on is missing. */
export const IN_PLAY_DAYS = 14;

export type StatusTournament = {
  hasDraw: boolean;
  starts_on: string | null;
  ends_on?: string | null;
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

/** Inclusive end of the tournament calendar day (UTC). */
export function eventEndMoment(
  row: Pick<StatusTournament, "ends_on">
): Date | null {
  if (!row.ends_on) return null;
  const d = new Date(`${row.ends_on}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
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
 * Entry is fillable (Open now):
 * - verified draw exists, lock has not passed, event not finished
 * - not started yet, OR started with a real lock_at still ahead (late fill)
 * Started weeks with no lock_at are not Open (no invented pick window).
 */
export function isEntryOpen(
  row: StatusTournament,
  now: Date = new Date()
) {
  if (!row.hasDraw || isEntryLocked(row, now) || isComplete(row, now)) {
    return false;
  }
  const age = daysFromStart(row, now);
  if (age == null) return false;
  if (age < 0) return true;
  // Late fill only when provider/admin gave a real lock still ahead.
  return Boolean(row.lock_at);
}

/**
 * Tournament week is underway: started and not yet complete.
 * Prefers ends_on when present; otherwise falls back to IN_PLAY_DAYS.
 */
export function isInPlay(
  row: Pick<StatusTournament, "starts_on" | "ends_on" | "lock_at">,
  now: Date = new Date()
) {
  const age = daysFromStart(row, now);
  if (age == null) return false;
  if (age < 0) return false;
  return !isComplete(row, now);
}

export function isComplete(
  row: Pick<StatusTournament, "starts_on" | "ends_on" | "lock_at">,
  now: Date = new Date()
) {
  const end = eventEndMoment(row);
  if (end) return now.getTime() > end.getTime();
  const age = daysFromStart(row, now);
  if (age == null) return false;
  return age > IN_PLAY_DAYS;
}

/**
 * On court: published draw is locked and the week has started (in play).
 * Locked-before-start does not count — that is not yet on court.
 */
export function isOnCourt(
  row: StatusTournament,
  now: Date = new Date()
): boolean {
  if (!row.hasDraw) return false;
  if (!isEntryLocked(row, now)) return false;
  return isInPlay(row, now);
}

/**
 * Label for a calendar / public-page status chip.
 * On court chip only for locked published draws in play.
 * Started + draw + no lock → not "open" (picks closed / viewing only).
 */
export function calendarStatus(
  row: StatusTournament,
  now: Date = new Date()
): CalendarStatus {
  if (isComplete(row, now)) return "complete";
  if (isOnCourt(row, now)) return "live";
  if (!row.hasDraw) return "drawPending";
  if (isEntryOpen(row, now)) return "open";
  if (isEntryLocked(row, now)) return "locked";
  // Published draw, week underway, no lock_at — not fillable.
  if (isInPlay(row, now)) return "live";
  return "open";
}

export function calendarStatusMessageKey(
  status: CalendarStatus
):
  | "calendar.drawPending"
  | "calendar.open"
  | "calendar.locked"
  | "calendar.onCourt"
  | "calendar.complete" {
  switch (status) {
    case "drawPending":
      return "calendar.drawPending";
    case "open":
      return "calendar.open";
    case "locked":
      return "calendar.locked";
    case "live":
      return "calendar.onCourt";
    case "complete":
      return "calendar.complete";
  }
}

export function formatCountdown(
  iso: string,
  locale: string,
  now: Date = new Date()
): string | null {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return null;
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3_600_000);
  try {
    if (days >= 1) {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
        days,
        "day"
      );
    }
    if (hours >= 1) {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
        hours,
        "hour"
      );
    }
    const minutes = Math.max(1, Math.floor(ms / 60_000));
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      minutes,
      "minute"
    );
  } catch {
    return null;
  }
}
