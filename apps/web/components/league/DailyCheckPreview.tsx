import Link from "next/link";
import { t } from "@/lib/i18n";

/** Landing skin of the Daily Check — a sample sentence, not live standings. */
export function DailyCheckPreview() {
  return (
    <section className="section" aria-labelledby="daily-preview">
      <div className="check-grid">
        <div>
          <div className="sec-head sec-head--flush">
            <p className="eyebrow">{t("landing.daily.title")}</p>
            <h2 id="daily-preview" className="section-title">
              {t("landing.daily.heading")}
            </h2>
            <p className="section-lede">{t("landing.daily.body")}</p>
          </div>
          <p className="check-see">
            <Link href="/leagues" className="act act--quiet">
              {t("landing.daily.seeLeague")}
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 8h11M9 4l4 4-4 4" />
              </svg>
            </Link>
          </p>
        </div>

        <div className="daily-check">
          <div className="check-head">
            <span className="daily-check-live">
              <span className="live-dot" aria-hidden />
              {t("daily.yours")}
            </span>
            <span className="daily-check-frame">
              {t("landing.daily.sample.when")}
            </span>
          </div>
          <p className="daily-check-headline">{t("landing.daily.sample.line")}</p>
          <p className="check-detail">{t("landing.daily.sample.detail")}</p>
          <dl className="check-stats">
            <div className="check-stat">
              <dt>{t("landing.daily.stat.settled")}</dt>
              <dd className="numeral">3</dd>
            </div>
            <div className="check-stat">
              <dt>{t("landing.daily.stat.correct")}</dt>
              <dd className="numeral" data-tone="data">
                2
              </dd>
            </div>
            <div className="check-stat">
              <dt>{t("landing.daily.stat.points")}</dt>
              <dd className="numeral" data-tone="data">
                +18
              </dd>
            </div>
            <div className="check-stat">
              <dt>{t("landing.daily.stat.places")}</dt>
              <dd className="numeral" data-tone="data">
                ↑4
              </dd>
            </div>
          </dl>
          <div className="check-foot">
            <p className="check-note">{t("landing.daily.sample.note")}</p>
            <Link
              href="/leagues"
              className="act act--standard act--standard-size"
            >
              {t("daily.cta.openBracket")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
