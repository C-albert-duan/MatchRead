import { t } from "@/lib/i18n";
import { isEntryLocked } from "@/lib/tournaments/status";
import {
  formatWhenCaption,
  tournamentTimeFacts,
  type TournamentTimeLabels,
  type TournamentTimeRow,
} from "@/lib/tournaments/time-facts";

export type { TournamentTimeRow, TournamentTimeLabels };

export function timeLabels(): TournamentTimeLabels {
  return {
    today: t("calendar.today"),
    tomorrow: t("calendar.tomorrow"),
    tbc: t("calendar.dateTbc"),
    entryLocks: t("calendar.entryLocks"),
    locked: t("tournament.locked"),
  };
}

/** True when the card/header should show an entry-lock countdown line. */
export function shouldShowEntryLock(
  row: TournamentTimeRow,
  now: Date = new Date()
): boolean {
  if (!row.lock_at) return false;
  return !isEntryLocked(
    {
      lock_at: row.lock_at,
      admin_locked_at: row.admin_locked_at,
      hasDraw: row.hasDraw,
    },
    now
  );
}

/**
 * Format lock for a known IANA zone (tests / rare server use).
 * Prefer `<EntryLockWhen />` in UI so the zone is the viewer’s local TZ.
 */
export function lockWhenLabel(
  row: TournamentTimeRow,
  locale: string,
  timeZone: string,
  now: Date = new Date()
): string | null {
  const labels = timeLabels();
  const facts = tournamentTimeFacts(row, locale, labels, now, timeZone);
  if (facts.locked || !facts.lock) return null;
  return `${labels.entryLocks} ${facts.lock}`;
}

export function whenCaption(
  row: TournamentTimeRow,
  locale: string,
  timeZone: string,
  now: Date = new Date()
): string {
  return formatWhenCaption(row, locale, timeLabels(), now, timeZone);
}
