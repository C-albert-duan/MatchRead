import {
  DAY_MS,
  IN_PLAY_DAYS,
  daysFromStart,
  eventMoment,
  isComplete,
  isEntryLocked,
  isEntryOpen,
  isOnCourt,
} from "./status.ts";

/** How far ahead Upcoming looks (calendar days). */
export const UPCOMING_HORIZON_DAYS = 14;

/** Cap homepage Upcoming so it stays a short “next up” list. */
export const UPCOMING_MAX = 6;

export type LandingTour = "atp" | "wta";

export type LandingEvent = {
  id: string;
  tour: LandingTour;
  hasDraw: boolean;
  starts_on: string | null;
  lock_at: string | null;
  admin_locked_at?: string | null;
};

/**
 * Homepage "Open now" — published draw, picks still fillable.
 * (Typically before lock / start; still Open if the week started but lock has not fired.)
 */
export function isOpenNow(
  row: LandingEvent,
  now: Date = new Date()
): boolean {
  return isEntryOpen(row, now);
}

export type LandingCalendar<T extends LandingEvent = LandingEvent> = {
  openNow: T[];
  onCourt: T[];
  upcoming: T[];
  /** Next event per tour beyond the lists — for fact empty states. */
  nextNamed: Partial<Record<LandingTour, T>>;
};

function startsInFuture(row: LandingEvent, now: Date): boolean {
  const age = daysFromStart(row, now);
  // Unknown start: keep only if we have no moment at all (rare); treat as not upcoming.
  if (age == null) return false;
  return age < 0;
}

/**
 * Split the landing calendar.
 * - Open now: published draw, picks still fillable.
 * - On court: published draw locked, event started — bracket view only.
 * - Upcoming: not started yet, no fillable bracket — next few within the horizon.
 */
export function partitionLandingCalendar<T extends LandingEvent>(
  events: T[],
  now: Date = new Date()
): LandingCalendar<T> {
  const horizonEnd = new Date(now.getTime() + UPCOMING_HORIZON_DAYS * DAY_MS);

  const openNow = events.filter((e) => isOpenNow(e, now));
  const openIds = new Set(openNow.map((e) => e.id));

  const onCourt = events.filter((e) => {
    if (openIds.has(e.id)) return false;
    return isOnCourt(e, now);
  });
  const onCourtIds = new Set(onCourt.map((e) => e.id));

  const upcoming = events
    .filter((e) => {
      if (openIds.has(e.id) || onCourtIds.has(e.id)) return false;
      if (isComplete(e, now)) return false;
      // Already fillable elsewhere, or already started without a public draw —
      // do not label either as Upcoming.
      if (e.hasDraw) return false;
      if (!startsInFuture(e, now)) return false;
      const moment = eventMoment(e);
      if (!moment) return false;
      return moment.getTime() <= horizonEnd.getTime();
    })
    .sort((a, b) => {
      const am = eventMoment(a)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bm = eventMoment(b)?.getTime() ?? Number.POSITIVE_INFINITY;
      return am - bm;
    })
    .slice(0, UPCOMING_MAX);

  const shownIds = new Set([
    ...openNow.map((e) => e.id),
    ...onCourt.map((e) => e.id),
    ...upcoming.map((e) => e.id),
  ]);
  const nextNamed: Partial<Record<LandingTour, T>> = {};

  for (const tour of ["atp", "wta"] as const) {
    const later = events
      .filter((e) => {
        if (e.tour !== tour) return false;
        if (shownIds.has(e.id)) return false;
        const age = daysFromStart(e, now);
        if (age != null && age > IN_PLAY_DAYS) return false;
        if (isEntryLocked(e, now) && e.hasDraw) return false;
        // Prefer a real next event that has not started (or is still open).
        if (!e.hasDraw && age != null && age >= 0) return false;
        return true;
      })
      .sort((a, b) => {
        const am = eventMoment(a)?.getTime() ?? Number.POSITIVE_INFINITY;
        const bm = eventMoment(b)?.getTime() ?? Number.POSITIVE_INFINITY;
        return am - bm;
      });
    if (later[0]) nextNamed[tour] = later[0];
  }

  return { openNow, onCourt, upcoming, nextNamed };
}
