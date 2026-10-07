/**
 * Viewer-local instants for tournament, bracket, and calendar surfaces.
 * Calendar dates (starts_on / ends_on) stay in dates.ts — they are not instants.
 *
 * profiles has no time_zone. The viewer zone is a stored preference when a
 * caller has one, otherwise the browser IANA zone. A missing zone stays null
 * so clocks stay hidden until the viewer zone is known. A caption that must
 * render anyway uses the venue zone, then UTC.
 */

export type MatchScheduleRow = {
  scheduled_at: string;
  has_time: boolean;
};

export type ViewerTimeInput = {
  /** preferences.time_zone when a caller has one. Not stored on profiles. */
  preference?: string | null;
  /** Browser IANA zone. Null before the client zone is known. */
  browserZone?: string | null;
};

/** Preference, then browser zone. Null when neither is known. Blank browser zone is UTC. */
export function viewerTimeZone(input: ViewerTimeInput = {}): string | null {
  const preference = input.preference?.trim();
  if (preference) return preference;
  if (input.browserZone == null) return null;
  return input.browserZone.trim() || "UTC";
}

/** Zone for a caption that cannot wait for the viewer. Venue, then UTC. */
export function captionTimeZone(
  viewerZone?: string | null,
  venueTz?: string | null
): string {
  return viewerZone?.trim() || venueTz?.trim() || "UTC";
}

function zoneOrUtc(timeZone: string | null | undefined): string {
  return timeZone?.trim() || "UTC";
}

function nextCalendarDay(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() + 1);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calendar day of an instant in an IANA zone, `YYYY-MM-DD`.
 * A US evening instant can be the previous day in that zone and the next day in UTC.
 */
export function calendarDayInZone(
  instant: string | Date,
  timeZone: string
): string | null {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneOrUtc(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

/** Short month for a UTC calendar day. Match lines uppercase it; date ranges do not. */
export function formatUtcMonth(
  instant: Date,
  locale: string,
  upper = false
): string {
  const month = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "short",
  })
    .format(instant)
    .replace(".", "");
  return upper ? month.toUpperCase() : month;
}

function formatClock(instant: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/**
 * Zone passed to formatMatchWhen.
 * A date-only row is a civil date and does not wait for a viewer zone.
 * A timed row stays hidden until that zone is known.
 */
export function matchWhenTimeZone(
  row: MatchScheduleRow | null | undefined,
  viewerZone: string | null | undefined
): string | null {
  if (!row?.scheduled_at) return null;
  if (!row.has_time) return "UTC";
  return viewerZone?.trim() || null;
}

/** Per-match when: `11 AUG · 14:00`, or the civil date alone when no clock is known. */
export function formatMatchWhen(
  row: MatchScheduleRow | null | undefined,
  timeZone: string,
  locale: string,
  tbc: string
): string {
  if (!row?.scheduled_at) return tbc;
  // Date-only rows are a civil date stored as an instant. The day is the UTC
  // calendar day of that instant, in every zone, and there is no clock.
  const zone = row.has_time ? zoneOrUtc(timeZone) : "UTC";
  const ymd = calendarDayInZone(row.scheduled_at, zone);
  if (!ymd) return tbc;
  const noon = new Date(`${ymd}T12:00:00Z`);
  const day = ymd.slice(8, 10);
  const month = formatUtcMonth(noon, locale, true);
  const date = `${day} ${month}`;
  if (!row.has_time) return date;
  return `${date} · ${formatClock(new Date(row.scheduled_at), zone, locale)}`;
}

/** Lock instant in the given IANA zone — day word when near, never a bare clock. */
export function formatLockWhen(
  lockAt: string,
  timeZone: string,
  locale: string,
  labels: { today: string; tomorrow: string },
  now: Date = new Date()
) {
  const zone = zoneOrUtc(timeZone);
  const target = new Date(lockAt);
  if (Number.isNaN(target.getTime())) return lockAt;
  const targetDay = calendarDayInZone(target, zone);
  const todayDay = calendarDayInZone(now, zone);
  if (!targetDay || !todayDay) return lockAt;
  const clock = formatClock(target, zone, locale);
  if (targetDay === todayDay) return `${labels.today} ${clock}`;
  if (targetDay === nextCalendarDay(todayDay)) return `${labels.tomorrow} ${clock}`;
  const longFmt = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${longFmt.format(target)}, ${clock}`;
}
