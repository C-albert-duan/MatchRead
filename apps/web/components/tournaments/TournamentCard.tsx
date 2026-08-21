import Link from "next/link";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { EntryLockWhen } from "@/components/tournaments/EntryLockWhen";
import { t } from "@/lib/i18n";
import type { Tour } from "@/lib/tournaments/calendar";
import { timeLabels } from "@/lib/tournaments/when";

type Chip = "upcoming";

type Props = {
  href: string;
  name: string;
  tour: Tour;
  surface: "hard" | "clay" | "grass" | "indoor" | "carpet" | "unknown";
  surfaceLabel: string;
  when: string;
  /** ISO lock instant — formatted in the viewer’s local timezone. */
  lockAt?: string | null;
  status: string;
  statusPending?: boolean;
  soon?: boolean;
  chip?: Chip | null;
  locale: string;
};

export function TournamentCard({
  href,
  name,
  tour,
  surface,
  surfaceLabel,
  when,
  lockAt = null,
  status,
  statusPending = false,
  soon = false,
  chip = null,
  locale,
}: Props) {
  const labels = timeLabels();
  return (
    <Link
      href={href}
      className={soon ? "trow trow--soon" : "trow"}
      data-s={surface}
    >
      <span className={`court-hairline court-${surface}`} aria-hidden />
      <div className="trow-top">
        <TourLabel tour={tour} />
        {chip === "upcoming" ? (
          <span className="chip chip--quiet">{t("chip.upcoming")}</span>
        ) : null}
      </div>
      <span className="trow-name">{name}</span>
      <div className="trow-foot">
        <span className="trow-meta">
          <span className="surf" data-s={surface}>
            <i aria-hidden />
            {surfaceLabel}
          </span>
          <i className="trow-sep" aria-hidden />
          <span className="trow-date numeral">{when}</span>
          {lockAt ? (
            <>
              <i className="trow-sep" aria-hidden />
              <EntryLockWhen
                lockAt={lockAt}
                locale={locale}
                labels={labels}
                className="trow-date numeral"
              />
            </>
          ) : null}
        </span>
        <span
          className="league-card-status"
          data-pending={statusPending ? "true" : undefined}
        >
          {status}
        </span>
      </div>
    </Link>
  );
}
