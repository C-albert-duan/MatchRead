/**
 * Viewer-local instants for tournament, bracket, and calendar surfaces.
 * Calendar dates (starts_on / ends_on) stay in dates.ts — they are not instants.
 *
 * profiles has no time_zone. The viewer zone is a stored preference when a
 * caller has one, otherwise the browser IANA zone. A missing zone stays null
 * so clocks stay hidden until the viewer zone is known. A caption that must
 * render anyway uses the venue zone, then UTC.
 */

export type MatchSession = "day" | "night" | null;

export type MatchPlayerSide = {
  ref: string;
  lastName: string;
  seed: number | null;
  countryCode: string;
};

export type MatchScheduleRow = {
  /** Stored start instant. There is no separate starts_at column. */
  scheduled_at: string | null;
  has_time: boolean;
  session?: MatchSession | null;
  court?: string | null;
  external_ref?: string | null;
  /** Official or scheduled, the same closed pair as MatchSheetState. */
  state?: "official" | "scheduled";
  /** Stored sides. Later rounds render these. They are not computed here. */
  side_a?: MatchPlayerSide | null;
  side_b?: MatchPlayerSide | null;
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

/** Unix epoch is an empty timestamp, not a published start. */
function isUnixEpoch(value: string): boolean {
  const instant = new Date(value);
  return !Number.isNaN(instant.getTime()) && instant.getTime() === 0;
}

/** UTC midnight is a date stamp, not a published kickoff. */
export function hasPublishedClock(
  row: MatchScheduleRow | null | undefined
): boolean {
  if (!row?.has_time || !row.scheduled_at) return false;
  const instant = new Date(row.scheduled_at);
  if (Number.isNaN(instant.getTime())) return false;
  return !(
    instant.getUTCHours() === 0 &&
    instant.getUTCMinutes() === 0 &&
    instant.getUTCSeconds() === 0 &&
    instant.getUTCMilliseconds() === 0
  );
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
  if (!hasPublishedClock(row)) return "UTC";
  return viewerZone?.trim() || null;
}

/**
 * Start caption for a match.
 * No stored instant → Time to be announced.
 * A timed instant stays hidden until `viewerZone` is known.
 * A date-only instant is the civil date plus that same phrase. Noon and
 * midnight are not shown as the match time.
 */
export function matchStartCaption(
  row: MatchScheduleRow | null | undefined,
  viewerZone: string | null | undefined,
  locale: string,
  tba: string,
  tbc: string
): string | null {
  if (!row?.scheduled_at || isUnixEpoch(row.scheduled_at)) return tba;
  const zone = matchWhenTimeZone(
    { scheduled_at: row.scheduled_at, has_time: row.has_time },
    viewerZone
  );
  if (!zone) return null;
  return formatMatchWhen(row, zone, locale, tbc, tba);
}

/** Per-match when: `11 AUG · 14:00`, or the civil date plus the TBA phrase. */
export function formatMatchWhen(
  row: MatchScheduleRow | null | undefined,
  timeZone: string,
  locale: string,
  tbc: string,
  tba = "Time to be announced"
): string {
  if (!row?.scheduled_at) return tbc;
  if (isUnixEpoch(row.scheduled_at)) return tba;
  // Date-only rows are a civil date stored as an instant. The day is the UTC
  // calendar day of that instant, in every zone. The stored noon or midnight
  // is not a kickoff.
  const timed = hasPublishedClock(row);
  const zone = timed ? zoneOrUtc(timeZone) : "UTC";
  const ymd = calendarDayInZone(row.scheduled_at, zone);
  if (!ymd) return tbc;
  const noon = new Date(`${ymd}T12:00:00Z`);
  const day = ymd.slice(8, 10);
  const month = formatUtcMonth(noon, locale, true);
  const date = `${day} ${month}`;
  if (!timed) return `${date} · ${tba}`;
  return `${date} · ${formatClock(new Date(row.scheduled_at), zone, locale)}`;
}

/**
 * Scheduled-node caption. The clock is `matchStartCaption`.
 * Session and court are omitted when null.
 */
export function matchScheduleCaption(
  row: MatchScheduleRow | null | undefined,
  viewerZone: string | null | undefined,
  locale: string,
  labels: { tba: string; tbc: string; day: string; night: string }
): { when: string | null; place: string | null } {
  const when = matchStartCaption(row, viewerZone, locale, labels.tba, labels.tbc);
  const session =
    row?.session === "day" ? labels.day : row?.session === "night" ? labels.night : null;
  const court = row?.court?.trim() || null;
  const place = [session, court].filter(Boolean).join(" · ") || null;
  return { when, place };
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
