import type { Tour } from "@/lib/tournaments/calendar";
import { t } from "@/lib/i18n";

/** Quiet tour identity — WTA uses --mr-wta; ATP stays muted context. */
export function TourLabel({ tour }: { tour: Tour }) {
  const label = tour === "wta" ? t("tour.wta") : t("tour.atp");
  return (
    <span
      className={
        tour === "wta" ? "tour-label tour-label--wta" : "tour-label"
      }
    >
      {label}
    </span>
  );
}
