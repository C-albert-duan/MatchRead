import Link from "next/link";
import { t, tf } from "@/lib/i18n";
import { isSoloPresentation } from "@/lib/leagues/solo";
import type { RecentLeagueActivity } from "@/lib/leagues/recent";

export function RecentLeagueCard({ activity }: { activity: RecentLeagueActivity }) {
  const { league, tournament, submittedAt, standing } = activity;
  const solo = isSoloPresentation({
    is_solo: league.is_solo,
    member_count: league.member_count,
  });
  const displayName = solo
    ? league.tournament_label ?? league.name
    : league.name;

  const bracketHref =
    tournament?.hasDraw
      ? `/leagues/${league.slug}/t/${tournament.ref}/bracket`
      : null;

  let entry = t("leagues.recent.bracketNone");
  if (submittedAt) entry = t("leagues.recent.bracketSubmitted");
  else if (activity.draftUpdatedAt) entry = t("leagues.recent.bracketDraft");

  return (
    <section className="recent-league" aria-labelledby="recent-league">
      <p className="eyebrow">{t("leagues.recent.eyebrow")}</p>
      <h2 id="recent-league" className="t-title3">
        {displayName}
      </h2>
      {tournament ? <p className="t-body">{tournament.name}</p> : null}
      <p className="t-caption">{entry}</p>
      {standing ? (
        <p className="recent-league-standing numeral">
          {tf("leagues.recent.standing", {
            n: standing.position,
            field: standing.fieldSize,
            score: standing.score,
          })}
        </p>
      ) : null}
      <div className="page-actions">
        <Link
          href={`/leagues/${league.slug}`}
          className="act act--prominent act--standard-size"
        >
          {t("leagues.recent.openLeague")}
        </Link>
        {bracketHref ? (
          <Link href={bracketHref} className="act act--standard act--standard-size">
            {t("tournament.openBracket")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
