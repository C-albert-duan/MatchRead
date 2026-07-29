type Props = {
  health: string | null;
  perfectRemaining: number | null;
  perfectLeagueCount: number | null;
};

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
        Your bracket
      </h2>
      <div className="row wrap gap-md">
        {health ? (
          <p className="engagement-stat">
            <span className="t-caption">Health</span>{" "}
            <span className="engagement-value">{health}</span>
          </p>
        ) : null}
        {perfectRemaining != null ? (
          <p className="engagement-stat">
            <span className="t-caption">Perfect picks left</span>{" "}
            <span className="engagement-value numeral">{perfectRemaining}</span>
            {perfectLeagueCount != null ? (
              <span className="t-caption">
                {" "}
                · {perfectLeagueCount}{" "}
                {perfectLeagueCount === 1 ? "perfect bracket" : "perfect brackets"}{" "}
                in league
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
