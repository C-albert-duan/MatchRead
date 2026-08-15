import {
  DAY_MS,
  IN_PLAY_DAYS,
  daysFromStart,
  eventMoment,
  isComplete,
  isEntryLocked,
  isEntryOpen,
  isInPlay,
} from "./status.ts";

export const UPCOMING_HORIZON_DAYS = 28;

export type LandingTour = "atp" | "wta";

export type LandingEvent = {
  id: string;
  tour: LandingTour;
  hasDraw: boolean;
  starts_on: string | null;
  lock_at: string | null;
  admin_locked_at?: string | null;
};

/** Homepage "Open now" — only when a person can still fill a bracket. */
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

/**
 * Split the landing calendar.
 * - Open now: verified draw, picks still unlocked.
 * - On court: the event has started (including locked draws).
 * - Upcoming: not started yet, within the horizon.
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
    return isInPlay(e, now);
  });
  const onCourtIds = new Set(onCourt.map((e) => e.id));

  const upcoming = events.filter((e) => {
    if (openIds.has(e.id) || onCourtIds.has(e.id)) return false;
    if (isComplete(e, now)) return false;
    if (isEntryLocked(e, now) && e.hasDraw) return false;
    const moment = eventMoment(e);
    if (!moment) return !e.hasDraw;
    return moment.getTime() <= horizonEnd.getTime();
  });

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
