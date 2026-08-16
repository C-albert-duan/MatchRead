import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { publicPageMetadata } from "@/lib/seo";
import { SurfaceKey } from "@/components/tournaments/SurfaceKey";
import { TournamentCard } from "@/components/tournaments/TournamentCard";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n";
import {
  calendarStatus,
  calendarStatusMessageKey,
  formatTournamentDate,
  listCalendarTournaments,
  surfaceClass,
  tournamentHref,
} from "@/lib/tournaments/calendar";
import { lockWhenLabel } from "@/lib/tournaments/when";

export const metadata: Metadata = publicPageMetadata({
  title: "Tournaments | MatchRead",
  path: "/tournaments",
});

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const user = await getSessionUser();
  const locale = getLocale();
  const tournaments = await listCalendarTournaments();
  const enterError = searchParams?.error?.trim() || null;

  return (
    <AppShell signedIn={Boolean(user)} email={user?.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">{t("calendar.eyebrow")}</p>
            <h1 className="t-page-title">{t("calendar.title")}</h1>
            <p className="t-lead">{t("calendar.lede")}</p>
          </div>
          <div className="page-actions">
            {user ? (
              <Link
                href="/leagues"
                className="act act--standard act--standard-size"
              >
                {t("leagues.my.title")}
              </Link>
            ) : (
              <Link
                href="/sign-in"
                className="act act--quiet"
              >
                {t("nav.signIn")}
              </Link>
            )}
            {user ? (
              <Link href="/leagues/new" className="act act--quiet">
                {t("cta.startLeague")}
              </Link>
            ) : null}
          </div>
        </header>

        {enterError ? (
          <p className="form-error" role="alert">
            {enterError}
          </p>
        ) : null}

        {tournaments.length === 0 ? (
          <p className="stub-note">{t("calendar.empty")}</p>
        ) : (
          <div className="calendar-block">
            <ul className="calendar focus-band">
              {tournaments.map((row) => {
                const href = tournamentHref(row.ref);
                const surface = surfaceClass(row.surface);
                const status = calendarStatus(row);
                return (
                  <li key={row.ref}>
                    <TournamentCard
                      href={href}
                      name={row.name}
                      tour={row.tour}
                      surface={surface}
                      surfaceLabel={t(
                        surface === "clay"
                          ? "surface.clay"
                          : surface === "grass"
                            ? "surface.grass"
                            : surface === "indoor"
                              ? "surface.indoor"
                              : "surface.hard"
                      )}
                      when={
                        formatTournamentDate(row.starts_on, locale, row.ends_on) ??
                        t("calendar.dateTbc")
                      }
                      lockWhen={lockWhenLabel(row, locale)}
                      status={t(calendarStatusMessageKey(status))}
                      statusPending={status === "drawPending"}
                      soon={status === "drawPending"}
                    />
                  </li>
                );
              })}
            </ul>
            <div className="cal-note">
              <SurfaceKey />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
