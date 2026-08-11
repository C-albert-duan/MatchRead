import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { SurfaceKey } from "@/components/tournaments/SurfaceKey";
import { TournamentCard } from "@/components/tournaments/TournamentCard";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import {
  formatTournamentDate,
  isOnCourt,
  listCalendarTournaments,
  surfaceClass,
} from "@/lib/tournaments/calendar";
import { lockWhenLabel } from "@/lib/tournaments/when";

type LeagueRow = {
  slug: string;
  format: "single" | "season";
  tournament_label: string | null;
  is_solo: boolean;
};

function hrefForTournament(
  tournamentName: string,
  tournamentRef: string,
  signedIn: boolean,
  leagues: LeagueRow[],
  hasDraw: boolean
): string {
  const enterHref = `/enter/${encodeURIComponent(tournamentRef)}`;

  const socialSingle = leagues.find(
    (l) =>
      !l.is_solo &&
      l.format === "single" &&
      l.tournament_label === tournamentName
  );
  if (socialSingle) {
    return `/leagues/${socialSingle.slug}/t/${tournamentRef}`;
  }

  const season = leagues.find((l) => l.format === "season");
  if (season) {
    return `/leagues/${season.slug}/t/${tournamentRef}`;
  }

  const solo = leagues.find(
    (l) =>
      l.is_solo &&
      l.format === "single" &&
      l.tournament_label === tournamentName
  );
  if (solo) {
    return `/leagues/${solo.slug}/t/${tournamentRef}`;
  }

  // Pure-fact: no enter path until a verified provider draw exists.
  if (!hasDraw) {
    return "/tournaments";
  }

  if (!signedIn) {
    return `/sign-in?next=${encodeURIComponent(enterHref)}`;
  }

  return enterHref;
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const user = await getSessionUser();
  const locale = getLocale();
  const supabase = createClient();
  const tournaments = await listCalendarTournaments();
  const enterError = searchParams?.error?.trim() || null;

  const leagues: LeagueRow[] = [];
  if (user) {
    const { data: memberships } = await supabase
      .from("league_members")
      .select("leagues ( slug, format, tournament_label, is_solo )")
      .eq("user_id", user.id);

    for (const row of memberships ?? []) {
      const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
      if (!league?.slug) continue;
      leagues.push({
        slug: league.slug,
        format: league.format as LeagueRow["format"],
        tournament_label: league.tournament_label,
        is_solo: Boolean(
          (league as { is_solo?: boolean | null }).is_solo
        ),
      });
    }
  }

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
                href="/sign-in?next=%2Ftournaments"
                className="act act--prominent act--prominent-size"
              >
                {t("cta.fillBracket")}
              </Link>
            )}
            <Link href="/leagues/new" className="act act--quiet">
              {t("cta.startLeague")}
            </Link>
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
              {tournaments.map((row, index) => {
                const href = hrefForTournament(
                  row.name,
                  row.ref,
                  Boolean(user),
                  leagues,
                  row.hasDraw
                );
                const surface = surfaceClass(row.surface);
                const showOnCourt =
                  isOnCourt(row) &&
                  !tournaments.slice(0, index).some((prior) => isOnCourt(prior));
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
                        formatTournamentDate(row.starts_on, locale) ??
                        t("calendar.dateTbc")
                      }
                      lockWhen={lockWhenLabel(row, locale)}
                      status={
                        row.hasDraw
                          ? t("calendar.open")
                          : t("league.status.drawPending")
                      }
                      statusPending={!row.hasDraw}
                      soon={!row.hasDraw}
                      chip={showOnCourt ? "onCourt" : null}
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
