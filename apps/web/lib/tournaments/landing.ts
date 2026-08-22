import {
  DAY_MS,
  daysFromStart,
  eventMoment,
  isComplete,
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
  main_draw_starts_on?: string | null;
  ends_on?: string | null;
  lock_at: string | null;
  admin_locked_at?: string | null;
};

/**
 * Homepage "Open now" — published draw, picks still fillable
 * (future start, or late fill while a real lock_at is still ahead).
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
 * Split the landing calendar (mutually exclusive).
 * - Open now: published draw, picks fillable (future, or late fill with lock_at).
 * - On court: published draw locked + week in play.
 * - Upcoming: not started, no published draw — next few within the horizon.
 * Hidden: finished; started with no draw; started with draw but no lock_at.
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
        if (isComplete(e, now)) return false;
        // Next-up copy: not-yet-started only (never a past Astana).
        if (!startsInFuture(e, now)) return false;
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
