import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { RecentLeagueCard } from "@/components/league/RecentLeagueCard";
import { publicPageMetadata } from "@/lib/seo";
import { getSessionUser } from "@/lib/auth";
import { t, tf } from "@/lib/i18n";
import { listMemberLeagues } from "@/lib/leagues/list";
import { loadRecentLeagueActivity } from "@/lib/leagues/recent";
import { isSoloPresentation } from "@/lib/leagues/solo";
import { createClient } from "@/lib/supabase/server";
import type { LeagueListItem } from "@/lib/leagues/types";
import {
  calendarStatus,
  calendarStatusMessageKey,
  listCalendarTournaments,
  type CalendarTournament,
} from "@/lib/tournaments/calendar";

function leagueStatus(
  league: LeagueListItem,
  byId: Map<string, CalendarTournament>
): string {
  if (league.format === "season") return t("leagues.status.season");
  if (!league.tournament_id) return t("league.format.single");
  const row = byId.get(league.tournament_id);
  if (!row) return t("league.format.single");
  return t(calendarStatusMessageKey(calendarStatus(row)));
}

export const metadata: Metadata = publicPageMetadata({
  title: "My leagues | MatchRead",
  path: "/leagues",
});

export default async function LeaguesPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Fleagues");
  }

  const supabase = createClient();
  const { leagues, error } = await listMemberLeagues(supabase, user.id);

  const byId = new Map<string, CalendarTournament>();
  if (leagues.length > 0) {
    const calendar = await listCalendarTournaments();
    for (const row of calendar) {
      byId.set(row.id, row);
    }
  }

  const recent =
    leagues.length > 0
      ? await loadRecentLeagueActivity(supabase, user.id, leagues)
      : null;

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">{t("nav.leagues")}</p>
            <h1 className="t-page-title">{t("leagues.my.title")}</h1>
            <p className="t-lead">{t("leagues.my.lede")}</p>
          </div>
          <div className="page-actions">
            <Link
              href="/tournaments"
              className="act act--prominent act--prominent-size"
            >
              {t("cta.fillBracket")}
            </Link>
            <Link
              href="/leagues/new"
              className="act act--standard act--standard-size"
            >
              {t("cta.startLeague")}
            </Link>
          </div>
        </header>

        {error ? (
          <p className="form-error" role="alert">
            Could not load leagues. Check Supabase migrations and connection.
            <br />
            <span className="t-caption">{error}</span>
          </p>
        ) : null}

        {!error && leagues.length === 0 ? (
          <div className="empty-invite focus-band">
            <h2 className="t-title3">{t("leagues.empty.title")}</h2>
            <p className="t-body">{t("leagues.empty.body")}</p>
            <div className="page-actions" style={{ alignSelf: "flex-start" }}>
              <Link
                href="/tournaments"
                className="act act--prominent act--prominent-size"
              >
                {t("cta.fillBracket")}
              </Link>
              <Link
                href="/leagues/new"
                className="act act--standard act--standard-size"
              >
                {t("cta.startLeague")}
              </Link>
            </div>
          </div>
        ) : null}

        {recent ? <RecentLeagueCard activity={recent} /> : null}

        {leagues.length > 0 ? (
          <ul className="league-list focus-band">
            {leagues.map((league) => {
              const solo = isSoloPresentation({
                is_solo: league.is_solo,
                member_count: league.member_count,
              });
              const displayName = solo
                ? league.tournament_label ?? league.name
                : league.name;
              return (
                <li key={league.id}>
                  <Link
                    href={`/leagues/${league.slug}`}
                    className="league-card"
                  >
                    <span
                      className="stack gap-sm"
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <span className="league-card-name">{displayName}</span>
                      <span className="t-caption">
                        {solo ? (
                          <>
                            {t("leagues.solo.badge")}
                            {" · "}
                            {t("leagues.solo.caption")}
                          </>
                        ) : (
                          <>
                            {league.format === "single"
                              ? league.tournament_label ??
                                t("league.format.single")
                              : t("league.format.season")}
                            {" · "}
                            {league.visibility}
                            {" · "}
                            {league.member_count === 1
                              ? tf("leagues.members.count.one", {
                                  n: league.member_count,
                                })
                              : tf("leagues.members.count", {
                                  n: league.member_count,
                                })}
                            {league.role === "commissioner"
                              ? ` · ${t("league.role.commissioner").toLowerCase()}`
                              : ""}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="league-card-status">
                      {leagueStatus(league, byId)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </AppShell>
  );
}
