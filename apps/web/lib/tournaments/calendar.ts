import { createClient } from "@/lib/supabase/server";
import { DAY_MS, isEntryLocked } from "@/lib/tournaments/status";
import { formatTournamentDate } from "@/lib/tournaments/dates";
export { formatTournamentDate };

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
  isOpenNow,
  partitionLandingCalendar,
  UPCOMING_HORIZON_DAYS,
} from "@/lib/tournaments/landing";
export type { LandingCalendar } from "@/lib/tournaments/landing";
export {
  enterHref,
  leagueNewHref,
  signInNextHref,
  tournamentHref,
} from "@/lib/tournaments/href";

export type Tour = "atp" | "wta";

export type CalendarTournament = {
  id: string;
  /** URL slug (DB `tournaments.slug`). */
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
  ends_on: string | null;
};

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

export function formatTournamentWhen(
  row: Pick<CalendarTournament, "starts_on" | "hasDraw" | "surface">,
  labels: { drawOpen: string; drawPending: string }
) {
  const parts: string[] = [];
  if (row.starts_on) parts.push(row.starts_on);
  parts.push(row.hasDraw ? labels.drawOpen : labels.drawPending);
  return parts.join(" · ");
}

export type TournamentTimeRow = {
  starts_on: string | null;
  ends_on?: string | null;
  lock_at?: string | null;
  admin_locked_at?: string | null;
  venue_tz?: string | null;
  hasDraw?: boolean;
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
  const start = formatTournamentDate(row.starts_on, locale, row.ends_on) ?? labels.tbc;
  const locked = isEntryLocked(
    {
      lock_at: row.lock_at ?? null,
      admin_locked_at: row.admin_locked_at,
      hasDraw: row.hasDraw,
    },
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
    parts.push(
      `${labels.starts} ${formatTournamentDate(row.starts_on, locale) ?? row.starts_on}`
    );
  }
  return parts.join(" · ");
}

/** Live tournaments from Supabase — no hardcoded calendar. No seed data. */
export async function listCalendarTournaments(): Promise<CalendarTournament[]> {
  const supabase = createClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select(
      "id, slug, name, surface, starts_on, ends_on, lock_at, venue_tz, tour, draw_size, published_at"
    )
    .not("slug", "like", "e2e-%")
    .order("starts_on", { ascending: true });

  return (tournaments ?? []).map((row) => mapCalendarRow(row));
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
      "id, slug, name, surface, starts_on, ends_on, lock_at, venue_tz, tour, draw_size, published_at"
    )
    .eq("slug", trimmed)
    .maybeSingle();
  if (!row) return null;
  return mapCalendarRow(row);
}

type TournamentQueryRow = {
  id: string;
  slug: string;
  name: string;
  surface: string | null;
  starts_on: string | null;
  ends_on?: string | null;
  lock_at: string | null;
  venue_tz: string | null;
  tour?: string | null;
  draw_size?: number | null;
  published_at?: string | null;
};

function mapCalendarRow(row: TournamentQueryRow): CalendarTournament {
  return {
    id: row.id,
    ref: row.slug,
    name: row.name,
    surface: row.surface ?? "hard",
    starts_on: row.starts_on,
    ends_on: row.ends_on ?? null,
    lock_at: row.lock_at ?? null,
    admin_locked_at: null,
    venue_tz: row.venue_tz || "UTC",
    tour: normalizeTour(row.tour),
    draw_size: row.draw_size && row.draw_size > 0 ? row.draw_size : 64,
    hasDraw: Boolean(row.published_at),
  };
}

/** Tournament ids with published_at set (official draw live). */
export async function listVerifiedDrawTournamentIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id")
    .not("published_at", "is", null);
  return new Set((data ?? []).map((r) => r.id));
}
