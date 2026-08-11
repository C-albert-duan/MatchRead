import { t } from "@/lib/i18n";
import {
  formatWhenCaption,
  tournamentTimeFacts,
  type TournamentTimeLabels,
  type TournamentTimeRow,
} from "@/lib/tournaments/calendar";

export function timeLabels(): TournamentTimeLabels {
  return {
    today: t("calendar.today"),
    tomorrow: t("calendar.tomorrow"),
    tbc: t("calendar.dateTbc"),
    entryLocks: t("calendar.entryLocks"),
    locked: t("tournament.locked"),
  };
}

export function lockWhenLabel(
  row: TournamentTimeRow,
  locale: string
): string | null {
  const labels = timeLabels();
  const facts = tournamentTimeFacts(row, locale, labels);
  if (facts.locked || !facts.lock) return null;
  return `${labels.entryLocks} ${facts.lock}`;
}

export function whenCaption(row: TournamentTimeRow, locale: string): string {
  return formatWhenCaption(row, locale, timeLabels());
}
