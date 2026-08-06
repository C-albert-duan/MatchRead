import { t, tf, type MessageKey } from "@/lib/i18n";

type Props = {
  health: string | null;
  perfectRemaining: number | null;
  perfectLeagueCount: number | null;
};

function healthKey(health: string): MessageKey {
  const key = `health.${health}` as MessageKey;
  return key;
}

export function EngagementStrip({
  health,
  perfectRemaining,
  perfectLeagueCount,
}: Props) {
  if (health == null && perfectRemaining == null) return null;

  return (
    <section
      className="engagement-strip stack gap-md"
      aria-labelledby="engagement-heading"
    >
      <h2 id="engagement-heading" className="section-title">
        {t("engage.yourBracket")}
      </h2>
      <div className="row wrap gap-md">
        {health ? (
          <p className="engagement-stat">
            <span className="t-caption">{t("engage.health")}</span>{" "}
            <span className="engagement-value">{t(healthKey(health))}</span>
          </p>
        ) : null}
        {perfectRemaining != null ? (
          <p className="engagement-stat">
            <span className="t-caption">{t("engage.perfectLeft")}</span>{" "}
            <span className="engagement-value numeral">{perfectRemaining}</span>
            {perfectLeagueCount != null ? (
              <span className="t-caption">
                {" "}
                ·{" "}
                {tf(
                  perfectLeagueCount === 1
                    ? "engage.perfectInLeague.one"
                    : "engage.perfectInLeague",
                  { n: perfectLeagueCount }
                )}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
