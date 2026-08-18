"use client";

import { useSyncExternalStore } from "react";
import { formatLockWhen } from "@/lib/tournaments/format";
import {
  formatWhenCaption,
  type TournamentTimeRow,
} from "@/lib/tournaments/time-facts";
import { t } from "@/lib/i18n";

function subscribeNoop() {
  return () => {};
}

function lockLabels() {
  return {
    today: t("calendar.today"),
    tomorrow: t("calendar.tomorrow"),
    tbc: t("calendar.dateTbc"),
    entryLocks: t("calendar.entryLocks"),
    locked: t("tournament.locked"),
  };
}

/** Browser IANA zone after mount; null on the server (avoids hydration mismatch). */
export function useViewerTimeZone(): string | null {
  return useSyncExternalStore(
    subscribeNoop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => null
  );
}

type EntryLockWhenProps = {
  lockAt: string;
  locale: string;
  className?: string;
  /** When false, render nothing (e.g. already locked / no draw). */
  show?: boolean;
};

/** “entry locks Today 10:00 AM” in the viewer’s local timezone. */
export function EntryLockWhen({
  lockAt,
  locale,
  className,
  show = true,
}: EntryLockWhenProps) {
  const zone = useViewerTimeZone();
  if (!show || !zone) return null;
  const labels = lockLabels();
  const when = formatLockWhen(lockAt, zone, locale, {
    today: labels.today,
    tomorrow: labels.tomorrow,
  });
  return (
    <span className={className}>{`${labels.entryLocks} ${when}`}</span>
  );
}

type WhenCaptionProps = {
  row: TournamentTimeRow;
  locale: string;
  className?: string;
};

/** Start date + lock/locked caption using the viewer’s local timezone for the clock. */
export function WhenCaption({ row, locale, className }: WhenCaptionProps) {
  const zone = useViewerTimeZone();
  const labels = lockLabels();
  if (!zone) {
    const start = formatWhenCaption({ ...row, lock_at: null }, locale, labels);
    return <span className={className}>{start}</span>;
  }
  return (
    <span className={className}>
      {formatWhenCaption(row, locale, labels, new Date(), zone)}
    </span>
  );
}
