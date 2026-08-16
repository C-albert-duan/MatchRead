import Link from "next/link";
import { t, tf } from "@/lib/i18n";
import { isSoloPresentation } from "@/lib/leagues/solo";
import type { RecentLeagueActivity } from "@/lib/leagues/recent";

function leagueLabel(activity: RecentLeagueActivity) {
  const { league } = activity;
  const solo = isSoloPresentation({
    is_solo: league.is_solo,
    member_count: league.member_count,
  });
  return solo ? league.tournament_label ?? league.name : league.name;
}

function headline(activity: RecentLeagueActivity, name: string) {
  const delta = activity.standing?.positionDelta;
  if (delta != null && delta > 0) {
    return delta === 1
      ? t("leagues.recent.up.one")
      : tf("leagues.recent.up", { n: delta });
  }
  if (delta != null && delta < 0) {
    const n = Math.abs(delta);
    return n === 1
      ? t("leagues.recent.down.one")
      : tf("leagues.recent.down", { n });
  }
  if (activity.standing) return t("daily.headline.quiet");
  if (activity.submittedAt) return t("leagues.recent.bracketSubmitted");
  if (activity.draftUpdatedAt) return t("leagues.recent.bracketDraft");
  return name;
}

/** Signed-in home: most recent league, in the Daily Check card. Facts only. */
export function HomeRecentCheck({ activity }: { activity: RecentLeagueActivity }) {
  const { league, tournament, standing, settledMatches } = activity;
  const name = leagueLabel(activity);
  const bracketHref =
    tournament?.hasDraw
      ? `/leagues/${league.slug}/t/${tournament.ref}/bracket`
      : null;
  const leagueHref = `/leagues/${league.slug}`;

  const detail = standing
    ? tf("leagues.recent.detail", {
        n: standing.position,
        field: standing.fieldSize,
        league: name,
      })
    : tournament?.name ?? t("leagues.recent.bracketNone");

  const note =
    standing?.championAlive === true
      ? t("leagues.recent.championAlive")
      : standing?.championAlive === false
        ? t("leagues.recent.championOut")
        : null;

  const places =
    standing?.positionDelta != null && standing.positionDelta !== 0
      ? standing.positionDelta > 0
        ? `↑${standing.positionDelta}`
        : `↓${Math.abs(standing.positionDelta)}`
      : standing
        ? String(standing.position)
        : null;
  const placesTone =
    standing?.positionDelta != null && standing.positionDelta > 0
      ? "data"
      : standing?.positionDelta != null && standing.positionDelta < 0
        ? "miss"
        : undefined;

  const points =
    standing?.scoreDelta != null && standing.scoreDelta !== 0
      ? `${standing.scoreDelta > 0 ? "+" : ""}${standing.scoreDelta}`
      : standing
        ? String(standing.score)
        : null;
  const pointsTone =
    standing?.scoreDelta != null && standing.scoreDelta > 0 ? "data" : undefined;

  const showStats = Boolean(standing);

  return (
    <section className="section" aria-labelledby="home-recent">
      <div className="check-grid">
        <div>
          <div className="sec-head sec-head--flush">
            <p className="eyebrow">{t("landing.daily.title")}</p>
            <h2 id="home-recent" className="section-title">
              {t("landing.daily.heading")}
            </h2>
            <p className="section-lede">{t("landing.daily.body")}</p>
          </div>
          <p className="check-see">
            <Link href={leagueHref} className="act act--quiet">
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
              {standing ? t("daily.yours") : t("leagues.recent.eyebrow")}
            </span>
            <span className="daily-check-frame">
              {tournament?.name ?? name}
            </span>
          </div>
          <p className="daily-check-headline">{headline(activity, name)}</p>
          <p className="check-detail">{detail}</p>
          {showStats ? (
            <dl className="check-stats">
              {settledMatches != null ? (
                <div className="check-stat">
                  <dt>{t("landing.daily.stat.settled")}</dt>
                  <dd className="numeral">{settledMatches}</dd>
                </div>
              ) : null}
              {standing?.correct != null ? (
                <div className="check-stat">
                  <dt>{t("landing.daily.stat.correct")}</dt>
                  <dd className="numeral" data-tone="data">
                    {standing.correct}
                  </dd>
                </div>
              ) : null}
              {points ? (
                <div className="check-stat">
                  <dt>{t("landing.daily.stat.points")}</dt>
                  <dd className="numeral" data-tone={pointsTone}>
                    {points}
                  </dd>
                </div>
              ) : null}
              {places ? (
                <div className="check-stat">
                  <dt>{t("landing.daily.stat.places")}</dt>
                  <dd className="numeral" data-tone={placesTone}>
                    {places}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <div className="check-foot">
            {note ? <p className="check-note">{note}</p> : null}
            <Link
              href={bracketHref ?? leagueHref}
              className="act act--standard act--standard-size"
            >
              {bracketHref
                ? t("daily.cta.openBracket")
                : t("leagues.recent.openLeague")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
