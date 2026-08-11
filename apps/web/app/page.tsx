import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { HeroCourt } from "@/components/shell/HeroCourt";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t, tf } from "@/lib/i18n";
import {
  formatTournamentWhen,
  formatUpcomingAction,
  isOnCourt,
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

const LADDER = ["R128", "R64", "R32", "R16", "QF", "SF", "F"] as const;

function surfaceKey(
  surface: string
): "surface.hard" | "surface.clay" | "surface.grass" | "surface.indoor" {
  const kind = surfaceClass(surface);
  if (kind === "clay") return "surface.clay";
  if (kind === "grass") return "surface.grass";
  if (kind === "indoor") return "surface.indoor";
  return "surface.hard";
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
  variant: "open" | "upcoming";
  locale: string;
}) {
  return (
    <ul className="calendar">
      {events.map((event) => {
        const onCourt = variant === "open" && isOnCourt(event);
        const surface = surfaceClass(event.surface);
        return (
          <li key={event.ref}>
            <Link
              href="/tournaments"
              className={
                variant === "upcoming" ? "trow trow--soon" : "trow"
              }
              data-s={surface}
            >
              <span
                className={`court-hairline court-${surface}`}
                aria-hidden
              />
              <div className="trow-top">
                <TourLabel tour={event.tour} />
                {variant === "upcoming" ? (
                  <span className="chip chip--quiet">{t("chip.upcoming")}</span>
                ) : onCourt ? (
                  <span className="chip chip--data">{t("chip.onCourt")}</span>
                ) : null}
              </div>
              <span className="trow-name">{event.name}</span>
              <div className="trow-foot">
                <span className="trow-meta">
                  <span className="surf" data-s={surface}>
                    <i aria-hidden />
                    {t(surfaceKey(event.surface))}
                  </span>
                  {" · "}
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
                <span
                  className="league-card-status"
                  data-pending={event.hasDraw ? undefined : "true"}
                >
                  {event.hasDraw
                    ? t("calendar.drawOpen")
                    : t("calendar.drawPending")}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function HomePage() {
  const user = await getSessionUser();
  const signedIn = Boolean(user);
  const locale = getLocale();
  const calendar = await listCalendarTournaments();
  const { openNow, upcoming, nextNamed } = partitionLandingCalendar(calendar);
  const onCourtCount = openNow.filter((event) => isOnCourt(event)).length;

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
                    {onCourtCount === 1
                      ? t("landing.chip.drawOpenOne")
                      : tf("landing.chip.drawsOpen", { n: onCourtCount })}
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
                  href="/sign-in?next=%2Ftournaments"
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
            <Link href="/showcase" className="act act--quiet">
              {t("landing.cta.showcase")}
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
          <p className="eyebrow">{t("landing.calendar.title")}</p>
          <h2 id="calendar-heading" className="section-title">
            {t("landing.calendar.lede")}
          </h2>

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
          <p className="eyebrow">{t("landing.how.title")}</p>
          <h2 id="how-heading" className="section-title">
            {t("landing.how.lede")}
          </h2>
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
              <Link href="/showcase" className="act act--quiet">
                {t("landing.cta.showcase")}
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
