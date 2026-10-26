import { t } from "@/lib/i18n";
import type { MyTennisTriad } from "@/lib/me/my-tennis";

/**
 * BANKED / PROJECTED / CEILING for one bracket. Banked is verified fact
 * (data green); projected and ceiling are the user's read (charcoal).
 * 2×2 on mobile: the label takes the first cell.
 */
export function CeilingTriad({ triad, tournamentName }: { triad: MyTennisTriad; tournamentName: string }) {
  return (
    <section className="triad" aria-labelledby="triad-label">
      <dl className="triad-grid">
        <div className="triad-cell triad-cell--label">
          <dt id="triad-label" className="eyebrow eyebrow--plain">
            {t("me.triad.label")}
          </dt>
          <dd className="t-caption">{tournamentName}</dd>
        </div>
        <div className="triad-cell" data-kind="banked">
          <dt className="t-caption">{t("me.triad.banked")}</dt>
          <dd className="triad-value numeral">{triad.banked}</dd>
        </div>
        <div className="triad-cell" data-kind="projected">
          <dt className="t-caption">{t("me.triad.projected")}</dt>
          <dd className="triad-value numeral">{triad.projected}</dd>
        </div>
        <div className="triad-cell" data-kind="ceiling">
          <dt className="t-caption">{t("me.triad.ceiling")}</dt>
          <dd className="triad-value numeral">{triad.ceiling}</dd>
        </div>
      </dl>
      <p className="t-caption">{t("me.triad.note")}</p>
    </section>
  );
}
