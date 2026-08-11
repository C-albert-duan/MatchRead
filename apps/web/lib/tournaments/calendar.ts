import { createClient } from "@/lib/supabase/server";

export type Tour = "atp" | "wta";

export type CalendarTournament = {
  id: string;
  ref: string;
  name: string;
  surface: string;
  starts_on: string | null;
  lock_at: string | null;
  venue_tz: string;
  tour: Tour;
  hasDraw: boolean;
};

/** Landing "Upcoming" looks ahead this many days — not one event, not the full season. */
export const UPCOMING_HORIZON_DAYS = 28;

const DAY_MS = 86_400_000;

/** Rough in-play window after start when the event still belongs on "Open now". */
const IN_PLAY_DAYS = 14;

export function normalizeTour(value: string | null | undefined): Tour {
  return value === "wta" ? "wta" : "atp";
}

export function surfaceClass(surface: string | null | undefined) {
  const s = (surface ?? "").toLowerCase();
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  if (s.includes("indoor") || s.includes("carpet")) return "indoor";
  return "hard";
}

/** Matches are being played — different from “you can still enter”. */
export function isOnCourt(
  row: Pick<CalendarTournament, "hasDraw" | "starts_on" | "lock_at">,
  now: Date = new Date()
) {
  if (!row.hasDraw) return false;
  const age = daysFromStart(row as CalendarTournament, now);
  if (age == null) return false;
  return age >= 0 && age <= IN_PLAY_DAYS;
}

export function isEntryLocked(
  row: Pick<CalendarTournament, "lock_at">,
  now: Date = new Date()
) {
  if (!row.lock_at) return false;
  return new Date(row.lock_at).getTime() <= now.getTime();
}

export function formatTournamentWhen(
  row: Pick<CalendarTournament, "starts_on" | "hasDraw" | "surface">,
  labels: { drawOpen: string; drawPending: string }
) {
  const parts: string[] = [];
  if (row.starts_on) parts.push(row.starts_on);
  parts.push(row.hasDraw ? labels.drawOpen : labels.drawPending);
  return parts.join(" · ");
}

/** Lock instant in venue zone — day word when near, never a bare clock. */
export function formatLockWhen(
  lockAt: string,
  venueTz: string,
  locale: string,
  labels: { today: string; tomorrow: string },
  now: Date = new Date()
) {
  const zone = venueTz || "UTC";
  const target = new Date(lockAt);
  const dayFmt = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const longFmt = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const targetDay = dayFmt.format(target);
  const todayDay = dayFmt.format(now);
  const tomorrow = new Date(now.getTime() + DAY_MS);
  const tomorrowDay = dayFmt.format(tomorrow);
  const clock = timeFmt.format(target);

  if (targetDay === todayDay) return `${labels.today} ${clock}`;
  if (targetDay === tomorrowDay) return `${labels.tomorrow} ${clock}`;
  return `${longFmt.format(target)}, ${clock}`;
}

export function formatUpcomingAction(
  row: Pick<
    CalendarTournament,
    "hasDraw" | "lock_at" | "venue_tz" | "starts_on" | "surface"
  >,
  labels: {
    drawOpen: string;
    drawPending: string;
    entryLocks: string;
    starts: string;
    today: string;
    tomorrow: string;
  },
  locale: string,
  now: Date = new Date()
) {
  const parts: string[] = [];
  parts.push(row.hasDraw ? labels.drawOpen : labels.drawPending);
  if (row.lock_at) {
    parts.push(
      `${labels.entryLocks} ${formatLockWhen(
        row.lock_at,
        row.venue_tz,
        locale,
        { today: labels.today, tomorrow: labels.tomorrow },
        now
      )}`
    );
  } else if (row.starts_on) {
    parts.push(`${labels.starts} ${row.starts_on}`);
  }
  return parts.join(" · ");
}

function eventMoment(row: CalendarTournament): Date | null {
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

function daysFromStart(row: CalendarTournament, now: Date): number | null {
  const start = eventMoment(row);
  if (!start) return null;
  return (now.getTime() - start.getTime()) / DAY_MS;
}

/** Fillable now, or draw is live and the tournament week is still current. */
export function isOpenNow(
  row: CalendarTournament,
  now: Date = new Date()
): boolean {
  if (!row.hasDraw) return false;
  if (!isEntryLocked(row, now)) return true;
  const age = daysFromStart(row, now);
  if (age == null) return false;
  return age >= -2 && age <= IN_PLAY_DAYS;
}

export type LandingCalendar = {
  openNow: CalendarTournament[];
  upcoming: CalendarTournament[];
  /** Next event per tour beyond the upcoming list — for fact empty states. */
  nextNamed: Partial<Record<Tour, CalendarTournament>>;
};

/**
 * Split the calendar for the landing strip.
 * - Open now: entry open, or the current tournament week (both tours).
 * - Upcoming: not yet current, within the horizon.
 * - nextNamed: soonest later event per tour when Upcoming is empty.
 */
export function partitionLandingCalendar(
  events: CalendarTournament[],
  now: Date = new Date()
): LandingCalendar {
  const horizonEnd = new Date(now.getTime() + UPCOMING_HORIZON_DAYS * DAY_MS);

  const openNow = events.filter((e) => isOpenNow(e, now));
  const openIds = new Set(openNow.map((e) => e.id));

  const upcoming = events.filter((e) => {
    if (openIds.has(e.id)) return false;
    const age = daysFromStart(e, now);
    if (age != null && age > IN_PLAY_DAYS) return false;
    if (isEntryLocked(e, now) && e.hasDraw) return false;
    const moment = eventMoment(e);
    if (!moment) return !e.hasDraw;
    return moment.getTime() <= horizonEnd.getTime();
  });

  const shownIds = new Set([
    ...openNow.map((e) => e.id),
    ...upcoming.map((e) => e.id),
  ]);
  const nextNamed: Partial<Record<Tour, CalendarTournament>> = {};

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

  return { openNow, upcoming, nextNamed };
}

/**
 * Tournament ids with a verified provider draw: at least one non-bye seat
 * carries `provider_player_id`. Placeholder / empty draws do not count.
 */
export async function listVerifiedDrawTournamentIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data: draws } = await supabase.from("draws").select("id, tournament_id");
  if (!draws?.length) return new Set();

  const drawIds = draws.map((d) => d.id);
  const { data: seats } = await supabase
    .from("draw_seats")
    .select("draw_id")
    .in("draw_id", drawIds)
    .eq("is_bye", false)
    .not("provider_player_id", "is", null);

  const verifiedDrawIds = new Set((seats ?? []).map((s) => s.draw_id));
  return new Set(
    draws.filter((d) => verifiedDrawIds.has(d.id)).map((d) => d.tournament_id)
  );
}

/** Live tournaments from Supabase — no hardcoded calendar. */
export async function listCalendarTournaments(): Promise<CalendarTournament[]> {
  const supabase = createClient();
  const [{ data: tournaments }, verifiedIds] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, ref, name, surface, starts_on, lock_at, venue_tz, tour")
      .order("starts_on", { ascending: true }),
    listVerifiedDrawTournamentIds(),
  ]);

  return (tournaments ?? []).map((row) => ({
    id: row.id,
    ref: row.ref,
    name: row.name,
    surface: row.surface ?? "hard",
    starts_on: row.starts_on,
    lock_at: row.lock_at ?? null,
    venue_tz: row.venue_tz || "UTC",
    tour: normalizeTour((row as { tour?: string | null }).tour),
    hasDraw: verifiedIds.has(row.id),
  }));
}
