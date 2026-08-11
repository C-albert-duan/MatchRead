import Link from "next/link";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { t } from "@/lib/i18n";
import type { Tour } from "@/lib/tournaments/calendar";

type Chip = "onCourt" | "upcoming";

type Props = {
  href: string;
  name: string;
  tour: Tour;
  surface: "hard" | "clay" | "grass" | "indoor";
  surfaceLabel: string;
  when: string;
  /** Venue-local lock, e.g. `entry locks Today 14:00`. Omit once locked. */
  lockWhen?: string | null;
  status: string;
  statusPending?: boolean;
  soon?: boolean;
  chip?: Chip | null;
};

export function TournamentCard({
  href,
  name,
  tour,
  surface,
  surfaceLabel,
  when,
  lockWhen = null,
  status,
  statusPending = false,
  soon = false,
  chip = null,
}: Props) {
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
        ) : chip === "onCourt" ? (
          <span className="chip chip--live">
            <i className="live-dot" aria-hidden />
            {t("chip.onCourt")}
            <span className="sr-only">{t("chip.onCourt.hint")}</span>
          </span>
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
          {lockWhen ? (
            <>
              <i className="trow-sep" aria-hidden />
              <span className="trow-date numeral">{lockWhen}</span>
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
