import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { OfficialResults } from "@matchread/core";
import { AppShell } from "@/components/shell/AppShell";
import { AnnouncedFirstRound } from "@/components/bracket/AnnouncedFirstRound";
import { PublicOfficialDraw } from "@/components/bracket/PublicOfficialDraw";
import { TrackOnMount } from "@/components/shell/Telemetry";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t, tf } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveDrawSize,
  loadAnnouncedMatchups,
  loadMatchScheduleMap,
  loadOfficialResultsMap,
  loadTournamentSeats,
} from "@/lib/brackets/types";
import { publicPageMetadata } from "@/lib/seo";
import {
  calendarStatus,
  calendarStatusMessageKey,
  enterHref,
  formatCountdown,
  formatTournamentDate,
  getCalendarTournament,
  isEntryOpen,
  leagueNewHref,
  signInNextHref,
  startInstant,
  surfaceClass,
  tournamentHref,
  type MatchScheduleRow,
} from "@/lib/tournaments/calendar";
import { lockWhenLabel } from "@/lib/tournaments/when";

export const dynamic = "force-dynamic";

type Props = {
  params: { ref: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getCalendarTournament(decodeURIComponent(params.ref));
  if (!event) return publicPageMetadata({ title: "MatchRead", path: "/" });
  return publicPageMetadata({
    title: `${event.name} | MatchRead`,
    description: `${event.name} official draw, dates, and entry on MatchRead.`,
    path: tournamentHref(event.ref),
  });
}

export default async function PublicTournamentPage({ params }: Props) {
  const ref = decodeURIComponent(params.ref).trim();
  const event = await getCalendarTournament(ref);
  if (!event) notFound();

  const user = await getSessionUser();
  const locale = getLocale();
  const status = calendarStatus(event);
  const entryOpen = isEntryOpen(event);
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
  const enterPath = enterHref(event.ref);
  // Anyone can view the official sheet. Picking (or Fill bracket) sends
  // signed-out users to sign-in, then back to enter.
  const fillHref = user ? enterPath : signInNextHref(enterPath);
  const leagueCta = user ? leagueHref : signInNextHref(leagueHref);
  const pickHref = entryOpen ? fillHref : undefined;
  const when =
    formatTournamentDate(event.starts_on, locale, event.ends_on) ?? t("calendar.dateTbc");
  const lockWhen = lockWhenLabel(event, locale);

  const supabase = createClient();
  const official: OfficialResults = {};
  const schedule: Record<string, MatchScheduleRow> = {};

  // Sheet visibility follows seats / match facts only — never open vs live/locked.
  const [announced, seats, officialMap, scheduleMap] = await Promise.all([
    loadAnnouncedMatchups(supabase, event.id, {
      allRounds: true,
      bothSidesOnly: false,
    }),
    loadTournamentSeats(supabase, event.id),
    loadOfficialResultsMap(supabase, event.id),
    loadMatchScheduleMap(supabase, event.id),
  ]);

  for (const [key, row] of Object.entries(officialMap)) {
    official[key] = row;
  }
  Object.assign(schedule, scheduleMap);

  const showDraw = seats.length > 0;
  const drawSize = effectiveDrawSize(seats.length, event.draw_size);
  const showMatchups = !showDraw && announced.length > 0;

  return (
    <AppShell signedIn={Boolean(user)} email={user?.email} arena={showDraw || event.hasDraw}>
      <TrackOnMount
        event="tournament_viewed"
        props={{ ref: event.ref, tour: event.tour }}
      />
      {showDraw ? (
        <TrackOnMount event="draw_viewed" props={{ ref: event.ref }} />
      ) : null}
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
            {entryOpen ? (
              <>
                <Link
                  href={fillHref}
                  className="act act--prominent act--prominent-size"
                >
                  {t("cta.fillBracket")}
                </Link>
                <Link
                  href={leagueCta}
                  className="act act--standard act--standard-size"
                >
                  {t("cta.startLeague")}
                </Link>
              </>
            ) : (
              <Link
                href={leagueCta}
                className="act act--standard act--standard-size"
              >
                {t("cta.startLeague")}
              </Link>
            )}
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
                <p className="t-lead numeral">
                  {tf("publicTournament.startsIn", { countdown: startCountdown })}
                </p>
              ) : null}
              {lockCountdown ? (
                <p className="t-body numeral">
                  {tf("publicTournament.entryLocksIn", {
                    countdown: lockCountdown,
                  })}
                </p>
              ) : null}
              <p className="t-caption">{t("publicTournament.whenPicking")}</p>
            </>
          ) : null}
          {status === "open" ? (
            <>
              {lockCountdown ? (
                <p className="t-lead numeral">
                  {tf("publicTournament.entryLocksIn", {
                    countdown: lockCountdown,
                  })}
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
          {!showDraw && !showMatchups && status !== "drawPending" ? (
            <p className="t-caption">{t("tournament.drawPending.body")}</p>
          ) : null}
        </section>

        {showMatchups ? (
          <AnnouncedFirstRound
            matchups={announced}
            expectedFirst={Math.max(Math.floor(drawSize / 2), 16)}
            locked={!entryOpen}
            enterHref={pickHref}
            venueTz={event.venue_tz}
            locale={locale}
          />
        ) : null}

        {showDraw ? (
          <section className="section" aria-labelledby="official-draw">
            <h2 id="official-draw" className="section-title">
              {t("publicTournament.officialDraw")}
            </h2>
            <PublicOfficialDraw
              drawSize={drawSize}
              seats={seats}
              official={official}
              schedule={schedule}
              venueTz={event.venue_tz}
              locale={locale}
              enterHref={pickHref}
              entryOpen={Boolean(pickHref)}
            />
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
