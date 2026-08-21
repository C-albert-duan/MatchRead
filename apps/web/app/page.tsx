import type { Metadata } from "next";
import Link from "next/link";
import { HomeRecentCheck } from "@/components/league/HomeRecentCheck";
import { AppShell } from "@/components/shell/AppShell";
import { HeroCourt } from "@/components/shell/HeroCourt";
import { SurfaceKey } from "@/components/tournaments/SurfaceKey";
import { TournamentCard } from "@/components/tournaments/TournamentCard";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t, tf } from "@/lib/i18n";
import { listMemberLeagues } from "@/lib/leagues/list";
import { loadRecentLeagueActivity } from "@/lib/leagues/recent";
import { publicPageMetadata } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import {
  calendarStatus,
  calendarStatusMessageKey,
  formatTournamentDate,
  listCalendarTournaments,
  partitionLandingCalendar,
  surfaceClass,
  surfaceLabelKey,
  tournamentHref,
  type CalendarTournament,
  type Tour,
} from "@/lib/tournaments/calendar";
import { shouldShowEntryLock } from "@/lib/tournaments/when";

export const metadata: Metadata = publicPageMetadata({
  title: "MatchRead",
  path: "/",
});

const HOW_STEPS = [
  ["landing.how.1.title", "landing.how.1.body"],
  ["landing.how.2.title", "landing.how.2.body"],
  ["landing.how.3.title", "landing.how.3.body"],
  ["landing.how.4.title", "landing.how.4.body"],
] as const;

const LADDER = ["R128", "R64", "R32", "R16", "QF", "SF", "F"] as const;

function surfaceKey(
  surface: string
): "surface.hard" | "surface.clay" | "surface.grass" | "surface.carpet" | "surface.unknown" {
  return surfaceLabelKey(surface);
}

function UpcomingEmpty({
  nextNamed,
}: {
  nextNamed: Partial<Record<Tour, CalendarTournament>>;
}) {
  const atp = nextNamed.atp;
  const wta = nextNamed.wta;

  if (atp && wta) {
    return (
      <p className="calendar-fact">
        {tf("landing.calendar.upcoming.empty.both", {
          atp: atp.name,
          wta: wta.name,
        })}
      </p>
    );
  }

  const one = atp ?? wta;
  if (one) {
    return (
      <p className="calendar-fact">
        {tf("landing.calendar.upcoming.empty.next", {
          tour: one.tour === "wta" ? t("tour.wta") : t("tour.atp"),
          name: one.name,
        })}
      </p>
    );
  }

  return (
    <p className="calendar-fact">{t("landing.calendar.upcoming.empty.none")}</p>
  );
}

function TournamentRows({
  events,
  variant,
  locale,
}: {
  events: CalendarTournament[];
  variant: "open" | "onCourt" | "upcoming";
  locale: string;
}) {
  return (
    <ul className="calendar">
      {events.map((event) => {
        const status = calendarStatus(event);
        const surface = surfaceClass(event.surface);
        return (
          <li key={event.ref}>
            <TournamentCard
              href={tournamentHref(event.ref)}
              name={event.name}
              tour={event.tour}
              surface={surface}
              surfaceLabel={t(surfaceKey(event.surface))}
              when={formatTournamentDate(event.starts_on, locale, event.ends_on) ?? t("calendar.dateTbc")}
              lockAt={
                shouldShowEntryLock(event) ? event.lock_at : null
              }
              locale={locale}
              status={t(calendarStatusMessageKey(status))}
              statusPending={status === "drawPending"}
              soon={variant === "upcoming"}
              chip={variant === "upcoming" ? "upcoming" : null}
            />
          </li>
        );
      })}
    </ul>
  );
}

function calendarHeading(openCount: number, onCourtCount: number) {
  if (openCount === 0 && onCourtCount > 0) {
    return t("landing.calendar.heading.onCourt");
  }
  if (openCount === 0) return t("landing.calendar.heading.none");
  if (openCount === 1) return t("landing.calendar.heading.openOne");
  return tf("landing.calendar.heading.openMany", { n: openCount });
}

export default async function HomePage() {
  const user = await getSessionUser();
  const signedIn = Boolean(user);
  const locale = getLocale();
  const calendar = await listCalendarTournaments();
  const { openNow, onCourt, upcoming, nextNamed } =
    partitionLandingCalendar(calendar);
  const onCourtCount = onCourt.length;
  const lookEvent = onCourt[0] ?? openNow[0] ?? upcoming[0] ?? calendar[0];
  const lookHref = lookEvent ? tournamentHref(lookEvent.ref) : "/tournaments";

  const recent = signedIn && user
    ? await (async () => {
        const supabase = createClient();
        const { leagues } = await listMemberLeagues(supabase, user.id);
        if (leagues.length === 0) return null;
        return loadRecentLeagueActivity(supabase, user.id, leagues);
      })()
    : null;

  return (
    <AppShell signedIn={signedIn} email={user?.email} arena>
      <div className="page page--landing">
        <header className="landing-hero">
          <HeroCourt />
          <ul className="hero-cues">
            <li>
              <span>{t("landing.cue.tours")}</span>
            </li>
            <li className="sep" aria-hidden />
            <li>
              <span>{t("landing.cue.season")}</span>
            </li>
            <li className="sep" aria-hidden />
            <li>
              <span>{t("landing.cue.singles")}</span>
            </li>
            {onCourtCount > 0 ? (
              <>
                <li className="sep" aria-hidden />
                <li>
                  <span className="chip chip--live">
                    <i className="live-dot" aria-hidden />
                    {t("chip.onCourt")}
                  </span>
                </li>
              </>
            ) : null}
          </ul>

          <h1 className="t-hero">{t("landing.title")}</h1>
          <p className="t-lead">{t("landing.hero.lede")}</p>
          <div className="page-actions">
            {signedIn ? (
              <>
                <Link
                  href="/tournaments"
                  className="act act--prominent act--prominent-size"
                >
                  {t("landing.cta.bracket")}
                </Link>
                <Link
                  href="/leagues"
                  className="act act--standard act--standard-size"
                >
                  {t("landing.cta.leagues")}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/tournaments"
                  className="act act--prominent act--prominent-size"
                >
                  {t("landing.cta.bracket")}
                </Link>
                <Link
                  href="/sign-in?next=%2Fleagues%2Fnew"
                  className="act act--standard act--standard-size"
                >
                  {t("landing.cta.start")}
                </Link>
              </>
            )}
            <Link href={lookHref} className="act act--quiet">
              {t("landing.cta.look")}
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 8h11M9 4l4 4-4 4" />
              </svg>
            </Link>
          </div>
          <ol className="hero-ladder" aria-label="The rounds of a draw">
            {LADDER.map((round) => (
              <li key={round} data-last={round === "F" ? "true" : undefined}>
                {round}
              </li>
            ))}
          </ol>
        </header>

        <section className="section" aria-labelledby="calendar-heading">
          <div className="sec-head">
            <p className="eyebrow">{t("landing.calendar.title")}</p>
            <h2 id="calendar-heading" className="section-title">
              {calendarHeading(openNow.length, onCourt.length)}
            </h2>
            <p className="section-lede">{t("landing.calendar.lede")}</p>
          </div>

          {calendar.length === 0 ? (
            <p className="stub-note">{t("calendar.empty")}</p>
          ) : (
            <div className="calendar-panels">
              {onCourt.length > 0 ? (
                <div className="calendar-panel">
                  <h3 className="calendar-panel-title">
                    {t("landing.calendar.onCourt")}
                  </h3>
                  <TournamentRows
                    events={onCourt}
                    variant="onCourt"
                    locale={locale}
                  />
                </div>
              ) : null}

              <div className="calendar-panel">
                <h3 className="calendar-panel-title">
                  {t("landing.calendar.openNow")}
                </h3>
                {openNow.length === 0 ? (
                  <p className="calendar-fact">
                    {t("landing.calendar.openNow.empty")}
                  </p>
                ) : (
                  <TournamentRows
                    events={openNow}
                    variant="open"
                    locale={locale}
                  />
                )}
              </div>

              <div className="calendar-panel">
                <h3 className="calendar-panel-title">
                  {t("landing.calendar.upcoming")}
                </h3>
                {upcoming.length === 0 ? (
                  <UpcomingEmpty nextNamed={nextNamed} />
                ) : (
                  <TournamentRows
                    events={upcoming}
                    variant="upcoming"
                    locale={locale}
                  />
                )}
              </div>
            </div>
          )}

          <div className="cal-note">
            {calendar.length > 0 &&
            openNow.length === 0 &&
            onCourt.length === 0 &&
            upcoming.length === 0 ? (
              <p className="calendar-fact">
                {t("landing.calendar.upcoming.empty.none")}
              </p>
            ) : null}
            <SurfaceKey />
          </div>
        </section>

        {recent ? <HomeRecentCheck activity={recent} /> : null}

        <section className="section" aria-labelledby="how-heading">
          <div className="sec-head">
            <p className="eyebrow">{t("landing.how.title")}</p>
            <h2 id="how-heading" className="section-title">
              {t("landing.how.lede")}
            </h2>
            <p className="section-lede">{t("landing.how.body")}</p>
          </div>
          <ol className="steps">
            {HOW_STEPS.map((step, i) => (
              <li key={step[0]} className="stack gap-sm">
                <span className="eyebrow">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="t-title3">{t(step[0])}</h3>
                <p className="t-body">{t(step[1])}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="landing-close">
            <h2>{t("landing.close.title")}</h2>
            <div className="page-actions">
              <Link
                href={signedIn ? "/leagues/new" : "/sign-in?next=%2Fleagues%2Fnew"}
                className="act act--prominent act--prominent-size"
              >
                {t("landing.cta.start")}
              </Link>
              <Link href={lookHref} className="act act--quiet">
                {t("landing.cta.look")}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 8h11M9 4l4 4-4 4" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
