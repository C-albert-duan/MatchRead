import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { DrawSeat, OfficialResults } from "@matchread/core";
import { AppShell } from "@/components/shell/AppShell";
import { AnnouncedFirstRound } from "@/components/bracket/AnnouncedFirstRound";
import { PublicOfficialDraw } from "@/components/bracket/PublicOfficialDraw";
import { TrackOnMount } from "@/components/shell/Telemetry";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { getSessionUser } from "@/lib/auth";
import { getLocale, t, tf } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { DRAW_SEAT_SELECT, mapDrawSeat } from "@/lib/brackets/types";
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
  const fillHref = user
    ? enterHref(event.ref)
    : signInNextHref(enterHref(event.ref));
  const leagueCta = user ? leagueHref : signInNextHref(leagueHref);
  const canPick = Boolean(user) && entryOpen;
  const when =
    formatTournamentDate(event.starts_on, locale, event.ends_on) ?? t("calendar.dateTbc");
  const lockWhen = lockWhenLabel(event, locale);

  const supabase = createClient();
  const official: OfficialResults = {};
  const schedule: Record<string, MatchScheduleRow> = {};
  let seats: DrawSeat[] = [];
  const { data: announcedRows } = await supabase
    .from("announced_matchups")
    .select(
      "match_key, player1_ref, player1_last_name, player1_seed, player2_ref, player2_last_name, player2_seed, scheduled_at, has_time"
    )
    .eq("tournament_id", event.id)
    .order("scheduled_at", { ascending: true });
  const announced = announcedRows ?? [];

  if (event.hasDraw) {
    const { data: draw } = await supabase
      .from("draws")
      .select("id")
      .eq("tournament_id", event.id)
      .maybeSingle();
    if (draw) {
      const [{ data: seatRows }, { data: resultRows }, { data: scheduleRows }] =
        await Promise.all([
          supabase
            .from("draw_seats")
            .select(DRAW_SEAT_SELECT)
            .eq("draw_id", draw.id)
            .order("position", { ascending: true }),
          supabase
            .from("match_results")
            .select("match_key, winner_ref, voided")
            .eq("tournament_id", event.id),
          supabase
            .from("match_schedule")
            .select("match_key, scheduled_at, has_time")
            .eq("tournament_id", event.id),
        ]);
      seats = (seatRows ?? []).map(mapDrawSeat);
      for (const row of resultRows ?? []) {
        official[row.match_key] = {
          winnerRef: row.winner_ref,
          voided: row.voided,
        };
      }
      for (const row of scheduleRows ?? []) {
        if (!row.match_key || !row.scheduled_at) continue;
        schedule[row.match_key] = {
          scheduled_at: row.scheduled_at,
          has_time: Boolean(row.has_time),
        };
      }
    }
  }

  return (
    <AppShell signedIn={Boolean(user)} email={user?.email} arena={event.hasDraw}>
      <TrackOnMount
        event="tournament_viewed"
        props={{ ref: event.ref, tour: event.tour }}
      />
      {seats.length > 0 ? (
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
        </section>

        {seats.length === 0 && announced.length > 0 ? (
          <AnnouncedFirstRound
            matchups={announced}
            expectedFirst={Math.max(Math.floor(Number(event.draw_size || 64) / 2), 16)}
            locked={!canPick}
            enterHref={canPick ? enterHref(event.ref) : undefined}
            venueTz={event.venue_tz}
            locale={locale}
          />
        ) : null}

        {seats.length > 0 ? (
          <section className="section" aria-labelledby="official-draw">
            <h2 id="official-draw" className="section-title">
              {t("publicTournament.officialDraw")}
            </h2>
            <PublicOfficialDraw
              drawSize={event.draw_size}
              seats={seats}
              official={official}
              schedule={schedule}
              venueTz={event.venue_tz}
              locale={locale}
              enterHref={canPick ? enterHref(event.ref) : undefined}
              entryOpen={canPick}
            />
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
