import { createClient } from "@/lib/supabase/server";
import {
  DAY_MS,
  IN_PLAY_DAYS,
  daysFromStart,
  eventMoment,
  isEntryLocked,
  isEntryOpen,
  isInPlay,
} from "@/lib/tournaments/status";

export type { MatchScheduleRow } from "@/lib/tournaments/format";
export { formatMatchWhen } from "@/lib/tournaments/format";
export {
  calendarStatus,
  calendarStatusMessageKey,
  formatCountdown,
  isEntryLocked,
  isEntryOpen,
  isInPlay,
  startInstant,
  IN_PLAY_DAYS,
} from "@/lib/tournaments/status";
export {
  enterHref,
  leagueNewHref,
  signInNextHref,
  tournamentHref,
} from "@/lib/tournaments/href";

export type Tour = "atp" | "wta";

export type CalendarTournament = {
  id: string;
  ref: string;
  name: string;
  surface: string;
  starts_on: string | null;
  lock_at: string | null;
  admin_locked_at: string | null;
  venue_tz: string;
  tour: Tour;
  draw_size: number;
  hasDraw: boolean;
};

/** Landing "Upcoming" looks ahead this many days — not one event, not the full season. */
export const UPCOMING_HORIZON_DAYS = 28;

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
  return row.hasDraw && isInPlay(row, now);
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

/** Draw-sheet date: `03 AUG 2026`. Month follows the locale; day and year stay tabular. */
export function formatTournamentDate(
  startsOn: string | null,
  locale: string
): string | null {
  if (!startsOn) return null;
  const d = new Date(`${startsOn}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return startsOn;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d
    .toLocaleString(locale, { month: "short", timeZone: "UTC" })
    .replace(".", "")
    .toUpperCase();
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export type TournamentTimeRow = {
  starts_on: string | null;
  lock_at?: string | null;
  admin_locked_at?: string | null;
  venue_tz?: string | null;
};

export type TournamentTimeLabels = {
  today: string;
  tomorrow: string;
  tbc: string;
  entryLocks: string;
  locked: string;
};

/** Start date + venue-local lock. Never invents a clock we do not have. */
export function tournamentTimeFacts(
  row: TournamentTimeRow,
  locale: string,
  labels: Pick<TournamentTimeLabels, "today" | "tomorrow" | "tbc">,
  now: Date = new Date()
) {
  const start = formatTournamentDate(row.starts_on, locale) ?? labels.tbc;
  const locked = isEntryLocked(
    { lock_at: row.lock_at ?? null, admin_locked_at: row.admin_locked_at },
    now
  );
  const lock = row.lock_at
    ? formatLockWhen(
        row.lock_at,
        row.venue_tz || "UTC",
        locale,
        { today: labels.today, tomorrow: labels.tomorrow },
        now
      )
    : null;
  return { start, lock, locked };
}

/** One caption for headers: `03 AUG 2026 · entry locks Today 14:00`. */
export function formatWhenCaption(
  row: TournamentTimeRow,
  locale: string,
  labels: TournamentTimeLabels,
  now: Date = new Date()
) {
  const facts = tournamentTimeFacts(row, locale, labels, now);
  const parts = [facts.start];
  if (facts.locked) parts.push(labels.locked);
  else if (facts.lock) parts.push(`${labels.entryLocks} ${facts.lock}`);
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

/** Homepage "Open now" — only when a person can still fill a bracket. */
export function isOpenNow(
  row: CalendarTournament,
  now: Date = new Date()
): boolean {
  return isEntryOpen(row, now);
}

export type LandingCalendar = {
  openNow: CalendarTournament[];
  upcoming: CalendarTournament[];
  /** Next event per tour beyond the upcoming list — for fact empty states. */
  nextNamed: Partial<Record<Tour, CalendarTournament>>;
};

/**
 * Split the calendar for the landing strip.
 * - Open now: a verified draw that is still unlocked.
 * - Upcoming: not fillable yet, or live this week, within the horizon.
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
    if (isInPlay(e, now)) return true;
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
      .select(
        "id, ref, name, surface, starts_on, lock_at, admin_locked_at, venue_tz, tour, draw_size"
      )
      .order("starts_on", { ascending: true }),
    listVerifiedDrawTournamentIds(),
  ]);

  return (tournaments ?? []).map((row) => mapCalendarRow(row, verifiedIds));
}

export async function getCalendarTournament(
  ref: string
): Promise<CalendarTournament | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const supabase = createClient();
  const { data: row } = await supabase
    .from("tournaments")
    .select(
      "id, ref, name, surface, starts_on, lock_at, admin_locked_at, venue_tz, tour, draw_size"
    )
    .eq("ref", trimmed)
    .maybeSingle();
  if (!row) return null;
  const verifiedIds = await listVerifiedDrawTournamentIds();
  return mapCalendarRow(row, verifiedIds);
}

type TournamentQueryRow = {
  id: string;
  ref: string;
  name: string;
  surface: string | null;
  starts_on: string | null;
  lock_at: string | null;
  admin_locked_at: string | null;
  venue_tz: string | null;
  tour?: string | null;
  draw_size?: number | null;
};

function mapCalendarRow(
  row: TournamentQueryRow,
  verifiedIds: Set<string>
): CalendarTournament {
  return {
    id: row.id,
    ref: row.ref,
    name: row.name,
    surface: row.surface ?? "hard",
    starts_on: row.starts_on,
    lock_at: row.lock_at ?? null,
    admin_locked_at: row.admin_locked_at ?? null,
    venue_tz: row.venue_tz || "UTC",
    tour: normalizeTour(row.tour),
    draw_size: row.draw_size && row.draw_size > 0 ? row.draw_size : 64,
    hasDraw: verifiedIds.has(row.id),
  };
}
