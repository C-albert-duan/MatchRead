"use client";

import { captionTimeZone, formatLockWhen } from "@/lib/tournaments/format";
import {
  formatWhenCaption,
  type TournamentTimeLabels,
  type TournamentTimeRow,
} from "@/lib/tournaments/time-facts";
import { useViewerTimeZone } from "@/lib/tournaments/viewer-zone";

export { useViewerTimeZone };

type EntryLockWhenProps = {
  lockAt: string;
  locale: string;
  labels: Pick<TournamentTimeLabels, "today" | "tomorrow" | "entryLocks">;
  className?: string;
  /** Venue zone for the first HTML. The viewer zone replaces it after mount. */
  venueTz?: string | null;
  /** When false, render nothing (e.g. already locked / no draw). */
  show?: boolean;
};

/** “entry locks Today 10:00 AM”. Server HTML uses the venue zone, then UTC. */
export function EntryLockWhen({
  lockAt,
  locale,
  labels,
  className,
  venueTz,
  show = true,
}: EntryLockWhenProps) {
  const zone = captionTimeZone(useViewerTimeZone(), venueTz);
  if (!show) return null;
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
  labels: TournamentTimeLabels;
  className?: string;
};

/** Start date + lock/locked caption using the viewer’s local timezone for the clock. */
export function WhenCaption({
  row,
  locale,
  labels,
  className,
}: WhenCaptionProps) {
  const zone = useViewerTimeZone();
  return (
    <span className={className}>
      {formatWhenCaption(row, locale, labels, new Date(), zone)}
    </span>
  );
}
