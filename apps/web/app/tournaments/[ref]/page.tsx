import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t, tf } from "@/lib/i18n";
import {
  calendarStatus,
  calendarStatusMessageKey,
  formatCountdown,
  formatTournamentDate,
  getCalendarTournament,
  leagueNewHref,
  signInNextHref,
  startInstant,
  surfaceClass,
} from "@/lib/tournaments/calendar";
import { lockWhenLabel } from "@/lib/tournaments/when";

type Props = {
  params: { ref: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getCalendarTournament(decodeURIComponent(params.ref));
  if (!event) return { title: "MatchRead" };
  return { title: `${event.name} | MatchRead` };
}

export default async function PublicTournamentPage({ params }: Props) {
  const ref = decodeURIComponent(params.ref).trim();
  const event = await getCalendarTournament(ref);
  if (!event) notFound();

  const user = await getSessionUser();
  const locale = getLocale();
  const status = calendarStatus(event);
  const surface = surfaceClass(event.surface);
  const surfaceKey =
    surface === "clay"
      ? "surface.clay"
      : surface === "grass"
        ? "surface.grass"
        : surface === "indoor"
          ? "surface.indoor"
          : "surface.hard";
  const start = startInstant(event.starts_on);
  const startCountdown = start ? formatCountdown(start, locale) : null;
  const lockCountdown = event.lock_at
    ? formatCountdown(event.lock_at, locale)
    : null;
  const leagueHref = leagueNewHref(event.ref);
  const leagueCta = user ? leagueHref : signInNextHref(leagueHref);
  const when =
    formatTournamentDate(event.starts_on, locale) ?? t("calendar.dateTbc");
  const lockWhen = lockWhenLabel(event, locale);

  return (
    <AppShell signedIn={Boolean(user)} email={user?.email}>
      <div className={`page page--court page--court-${surface}`}>
        <header className="page-header page-header--split page-header--court">
          <div className="page-header-copy">
            <p className="eyebrow">
              <TourLabel tour={event.tour} />
            </p>
            <h1 className="t-page-title">{event.name}</h1>
            <p className="t-lead">
              {t(surfaceKey)}
              {" · "}
              <span className="numeral">{when}</span>
              {lockWhen ? (
                <>
                  {" · "}
                  <span className="numeral">{lockWhen}</span>
                </>
              ) : null}
              {" · "}
              {t(calendarStatusMessageKey(status))}
            </p>
          </div>
          <div className="page-actions">
            <Link
              href={leagueCta}
              className="act act--prominent act--prominent-size"
            >
              {t("cta.startLeague")}
            </Link>
            <Link href={leagueCta} className="act act--standard act--standard-size">
              {t("invite.cta")}
            </Link>
            <Link href="/tournaments" className="act act--quiet">
              {t("publicTournament.backCalendar")}
            </Link>
          </div>
        </header>

        <section className="panel stack gap-md focus-band" aria-labelledby="tournament-state">
          <h2 id="tournament-state" className="section-title">
            {t(calendarStatusMessageKey(status))}
          </h2>
          {status === "drawPending" ? (
            <>
              <p className="t-body">{t("publicTournament.pickingOpens")}</p>
              {startCountdown ? (
                <p className="t-lead numeral">{tf("publicTournament.startsIn", { countdown: startCountdown })}</p>
              ) : null}
              {lockCountdown ? (
                <p className="t-body numeral">
                  {tf("publicTournament.entryLocksIn", { countdown: lockCountdown })}
                </p>
              ) : null}
              <p className="t-caption">{t("publicTournament.whenPicking")}</p>
            </>
          ) : null}
          {status === "open" ? (
            <>
              {lockCountdown ? (
                <p className="t-lead numeral">
                  {tf("publicTournament.entryLocksIn", { countdown: lockCountdown })}
                </p>
              ) : null}
              <p className="t-body">{t("publicTournament.whenPicking")}</p>
            </>
          ) : null}
          {status === "locked" ? (
            <p className="t-body">{t("publicTournament.entryLocked")}</p>
          ) : null}
          {status === "live" ? (
            <p className="t-body">{t("publicTournament.live")}</p>
          ) : null}
          {status === "complete" ? (
            <p className="t-body">{t("publicTournament.complete")}</p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
