/** Client-safe lock / when captions. No Supabase, no next/headers. */

import { formatTournamentDate } from "@/lib/tournaments/dates";
import { formatLockWhen } from "@/lib/tournaments/format";
import { isEntryLocked } from "@/lib/tournaments/status";

export type TournamentTimeRow = {
  starts_on: string | null;
  main_draw_starts_on?: string | null;
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

/** Start date + lock clock. Pass `timeZone` (IANA) for viewer-local lock display. */
export function tournamentTimeFacts(
  row: TournamentTimeRow,
  locale: string,
  labels: Pick<TournamentTimeLabels, "today" | "tomorrow" | "tbc">,
  now: Date = new Date(),
  timeZone?: string | null
) {
  const start =
    formatTournamentDate(
      row.main_draw_starts_on || row.starts_on,
      locale,
      row.ends_on
    ) ?? labels.tbc;
  const locked = isEntryLocked(
    {
      lock_at: row.lock_at ?? null,
      admin_locked_at: row.admin_locked_at,
      hasDraw: row.hasDraw,
    },
    now
  );
  const zone = timeZone || row.venue_tz || "UTC";
  const lock = row.lock_at
    ? formatLockWhen(
        row.lock_at,
        zone,
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
  now: Date = new Date(),
  timeZone?: string | null
) {
  const facts = tournamentTimeFacts(row, locale, labels, now, timeZone);
  const parts = [facts.start];
  if (facts.locked) parts.push(labels.locked);
  else if (facts.lock) parts.push(`${labels.entryLocks} ${facts.lock}`);
  return parts.join(" · ");
}
