import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t, tf } from "@/lib/i18n";
import {
  formatTournamentWhen,
  formatUpcomingAction,
  listCalendarTournaments,
  partitionLandingCalendar,
  surfaceClass,
  type CalendarTournament,
  type Tour,
} from "@/lib/tournaments/calendar";

const HOW_STEPS = [
  ["landing.how.1.title", "landing.how.1.body"],
  ["landing.how.2.title", "landing.how.2.body"],
  ["landing.how.3.title", "landing.how.3.body"],
  ["landing.how.4.title", "landing.how.4.body"],
] as const;

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
  variant: "open" | "upcoming";
  locale: string;
}) {
  return (
    <ul className="calendar">
      {events.map((event) => (
        <li key={event.ref}>
          <Link href="/tournaments" className="trow">
            <span
              className={`court-hairline court-${surfaceClass(event.surface)}`}
              aria-hidden
            />
            <TourLabel tour={event.tour} />
            <span className="trow-name">{event.name}</span>
            <span className="trow-meta">
              {variant === "upcoming"
                ? formatUpcomingAction(
                    event,
                    {
                      drawOpen: t("calendar.drawOpen"),
                      drawPending: t("calendar.drawPending"),
                      entryLocks: t("calendar.entryLocks"),
                      starts: t("calendar.starts"),
                      today: t("calendar.today"),
                      tomorrow: t("calendar.tomorrow"),
                    },
                    locale
                  )
                : formatTournamentWhen(event, {
                    drawOpen: t("calendar.drawOpen"),
                    drawPending: t("calendar.drawPending"),
                  })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function HomePage() {
  const user = await getSessionUser();
  const signedIn = Boolean(user);
  const locale = getLocale();
  const calendar = await listCalendarTournaments();
  const { openNow, upcoming, nextNamed } = partitionLandingCalendar(calendar);

  return (
    <AppShell signedIn={signedIn} email={user?.email} arena>
      <div className="page page--landing">
        <header className="landing-hero">
          <h1 className="t-hero">MatchRead</h1>
          <p className="landing-hero-headline">{t("landing.title")}</p>
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
                  href="/sign-in?next=%2Ftournaments"
                  className="act act--prominent act--prominent-size"
                >
                  {t("landing.cta.bracket")}
                </Link>
                <Link
                  href="/sign-in?next=%2Fleagues%2Fnew"
                  className="act act--quiet"
                >
                  {t("landing.cta.start")}
                </Link>
              </>
            )}
            <Link href="/showcase" className="act act--quiet">
              {t("landing.cta.showcase")}
            </Link>
          </div>
        </header>

        <section className="section" aria-labelledby="calendar-heading">
          <h2 id="calendar-heading" className="section-title">
            {t("landing.calendar.title")}
          </h2>
          <p className="section-lede">{t("landing.calendar.lede")}</p>

          {calendar.length === 0 ? (
            <p className="stub-note">{t("calendar.empty")}</p>
          ) : (
            <div className="calendar-panels">
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
        </section>

        <section className="section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="section-title">
            {t("landing.how.title")}
          </h2>
          <p className="section-lede">{t("landing.how.lede")}</p>
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
      </div>
    </AppShell>
  );
}
