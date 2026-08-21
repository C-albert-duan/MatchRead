import { createClient } from "@/lib/supabase/server";
import { formatTournamentDate } from "@/lib/tournaments/dates";
import { formatLockWhen } from "@/lib/tournaments/format";
export { formatTournamentDate };
export { formatLockWhen };
export {
  formatWhenCaption,
  tournamentTimeFacts,
  type TournamentTimeLabels,
  type TournamentTimeRow,
} from "@/lib/tournaments/time-facts";

export type { MatchScheduleRow } from "@/lib/tournaments/format";
export { formatMatchWhen } from "@/lib/tournaments/format";
export {
  calendarStatus,
  calendarStatusMessageKey,
  formatCountdown,
  isEntryLocked,
  isEntryOpen,
  isInPlay,
  isOnCourt,
  startInstant,
  IN_PLAY_DAYS,
} from "@/lib/tournaments/status";
export {
  isOpenNow,
  partitionLandingCalendar,
  UPCOMING_HORIZON_DAYS,
  UPCOMING_MAX,
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
  if (!s) return "unknown";
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  if (s.includes("carpet")) return "carpet";
  if (s.includes("hard")) return "hard";
  return "unknown";
}

/** i18n key for a surface class — never invent Hard for unknown. */
export function surfaceLabelKey(
  surface: string | null | undefined
): "surface.hard" | "surface.clay" | "surface.grass" | "surface.carpet" | "surface.unknown" {
  const kind = surfaceClass(surface);
  if (kind === "clay") return "surface.clay";
  if (kind === "grass") return "surface.grass";
  if (kind === "carpet") return "surface.carpet";
  if (kind === "hard") return "surface.hard";
  return "surface.unknown";
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
  now: Date = new Date(),
  timeZone?: string | null
) {
  const parts: string[] = [];
  parts.push(row.hasDraw ? labels.drawOpen : labels.drawPending);
  if (row.lock_at) {
    parts.push(
      `${labels.entryLocks} ${formatLockWhen(
        row.lock_at,
        timeZone || row.venue_tz || "UTC",
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
      "id, slug, name, surface, starts_on, ends_on, lock_at, venue_tz, tour, draw_size, published_at, bracket_eligible, seats(count)"
    )
    .eq("bracket_eligible", true)
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
      "id, slug, name, surface, starts_on, ends_on, lock_at, venue_tz, tour, draw_size, published_at, seats(count)"
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
  seats?: { count: number }[] | null;
};

/** Official sheet: published + seat count matches power-of-two draw_size. */
export function hasOfficialDrawSheet(row: {
  published_at?: string | null;
  draw_size?: number | null;
  seat_count?: number | null;
}): boolean {
  if (!row.published_at) return false;
  const n = Number(row.draw_size) || 0;
  const seats = Number(row.seat_count) || 0;
  if (n < 2 || (n & (n - 1)) !== 0) return false;
  return seats === n;
}

function seatCountFromEmbed(
  seats: { count: number }[] | null | undefined
): number {
  if (!Array.isArray(seats) || seats.length === 0) return 0;
  return Number(seats[0]?.count) || 0;
}

function mapCalendarRow(row: TournamentQueryRow): CalendarTournament {
  const drawSize = row.draw_size && row.draw_size > 0 ? row.draw_size : 0;
  const seatCount = seatCountFromEmbed(row.seats);
  return {
    id: row.id,
    ref: row.slug,
    name: row.name,
    surface: row.surface ?? "",
    starts_on: row.starts_on,
    ends_on: row.ends_on ?? null,
    lock_at: row.lock_at ?? null,
    admin_locked_at: null,
    venue_tz: row.venue_tz || "UTC",
    tour: normalizeTour(row.tour),
    draw_size: drawSize,
    hasDraw: hasOfficialDrawSheet({
      published_at: row.published_at,
      draw_size: drawSize,
      seat_count: seatCount,
    }),
  };
}

/** Tournament ids with a verified official sheet (published + seat count). */
export async function listVerifiedDrawTournamentIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id, draw_size, published_at, seats(count)")
    .not("published_at", "is", null);
  return new Set(
    (data ?? [])
      .filter((row) =>
        hasOfficialDrawSheet({
          published_at: row.published_at,
          draw_size: Number(row.draw_size) || 0,
          seat_count: seatCountFromEmbed(
            row.seats as { count: number }[] | null
          ),
        })
      )
      .map((r) => r.id)
  );
}
