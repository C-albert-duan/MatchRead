import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { publicPageMetadata } from "@/lib/seo";
import type {
  BracketConfidence,
  BracketPicks,
  OfficialResults,
} from "@matchread/core";
import { AppShell } from "@/components/shell/AppShell";
import { AnnouncedFirstRound } from "@/components/bracket/AnnouncedFirstRound";
import { BracketEditor } from "@/components/bracket/BracketEditor";
import { getSessionUser } from "@/lib/auth";
import {
  DRAW_SEAT_SELECT,
  isPlatformLocked,
  isTournamentLocked,
  loadLeagueDrawLock,
  mapDrawSeat,
} from "@/lib/brackets/types";
import { getLocale, t, tf } from "@/lib/i18n";
import { isSoloPresentation } from "@/lib/leagues/solo";
import { leagueIncludesTournament } from "@/lib/leagues/covers";
import { createClient } from "@/lib/supabase/server";
import type { MatchScheduleRow } from "@/lib/tournaments/calendar";
import { whenCaption } from "@/lib/tournaments/when";

type Props = {
  params: { slug: string; ref: string };
};

export const metadata: Metadata = publicPageMetadata({
  title: "My Bracket | MatchRead",
  path: "/leagues",
});

export default async function BracketPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(
        `/leagues/${params.slug}/t/${params.ref}/bracket`
      )}`
    );
  }

  const supabase = createClient();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, slug, name, format, tournament_label, tournament_id, is_solo")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!league) notFound();

  const [{ data: membership }, { count: memberCount }] = await Promise.all([
    supabase
      .from("league_members")
      .select("role")
      .eq("league_id", league.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("league_members")
      .select("*", { count: "exact", head: true })
      .eq("league_id", league.id),
  ]);

  if (!membership) notFound();

  const solo = isSoloPresentation({
    is_solo: Boolean((league as { is_solo?: boolean }).is_solo),
    member_count: memberCount ?? 1,
  });

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("ref", params.ref)
    .maybeSingle();

  if (!tournament) notFound();

  if (
    league.format === "single" &&
    !leagueIncludesTournament(league, tournament.id)
  ) {
    notFound();
  }

  const [{ data: draw }, { data: announcedRows }, { data: announcedBracket }, leagueLockedAt] =
    await Promise.all([
      supabase
        .from("draws")
        .select("id")
        .eq("tournament_id", tournament.id)
        .maybeSingle(),
      supabase
        .from("announced_matchups")
        .select(
          "match_key, player1_ref, player1_last_name, player1_seed, player2_ref, player2_last_name, player2_seed, scheduled_at, has_time"
        )
        .eq("tournament_id", tournament.id)
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("brackets")
        .select("picks, submitted_at")
        .eq("league_id", league.id)
        .eq("tournament_id", tournament.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      loadLeagueDrawLock(supabase, league.id, tournament.id),
    ]);

  const announced = announcedRows ?? [];
  const locked = isTournamentLocked({
    ...tournament,
    league_locked_at: leagueLockedAt,
  });

  if (!draw) {
    if (announced.length === 0) {
      redirect(`/leagues/${league.slug}/t/${tournament.ref}`);
    }
    return (
      <AppShell signedIn email={user.email}>
        <div className="page">
          <header className="page-header page-header--split">
            <div className="page-header-copy">
              <p className="eyebrow">
                {solo ? t("league.solo.eyebrow") : league.name}
              </p>
              <h1 className="t-page-title">
                {tf("bracket.page.title", { name: tournament.name })}
              </h1>
            </div>
            <div className="page-actions">
              <Link
                href={`/leagues/${league.slug}/t/${tournament.ref}`}
                className="act act--standard act--standard-size"
              >
                {t("common.tournament")}
              </Link>
              <Link
                href={`/leagues/${league.slug}`}
                className="act act--quiet"
              >
                {solo ? t("league.solo.home") : t("common.leagueHome")}
              </Link>
            </div>
          </header>
          <AnnouncedFirstRound
            matchups={announced}
            expectedFirst={Math.max(
              Math.floor(Number(tournament.draw_size || 64) / 2),
              16
            )}
            picks={(announcedBracket?.picks ?? {}) as BracketPicks}
            locked={locked}
            leagueId={league.id}
            leagueSlug={league.slug}
            tournamentId={tournament.id}
            tournamentRef={tournament.ref}
            venueTz={
              (tournament as { venue_tz?: string | null }).venue_tz || "UTC"
            }
            locale={getLocale()}
          />
        </div>
      </AppShell>
    );
  }

  const [
    { data: seatRows },
    { data: bracket },
    { data: resultRows },
    { data: scheduleRows },
  ] = await Promise.all([
      supabase
        .from("draw_seats")
        .select(
          DRAW_SEAT_SELECT
        )
        .eq("draw_id", draw.id)
        .order("position", { ascending: true }),
      supabase
        .from("brackets")
        .select("picks, confidence, submitted_at")
        .eq("league_id", league.id)
        .eq("tournament_id", tournament.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("match_results")
        .select("match_key, winner_ref, voided")
        .eq("tournament_id", tournament.id),
      supabase
        .from("match_schedule")
        .select("match_key, scheduled_at, has_time")
        .eq("tournament_id", tournament.id),
    ]);

  const seats = (seatRows ?? []).map(mapDrawSeat);
  const picks = (bracket?.picks ?? {}) as BracketPicks;
  const confidence = (bracket?.confidence ?? {}) as BracketConfidence;
  const platformLocked = isPlatformLocked(tournament);

  const officialResults: OfficialResults = {};
  for (const row of resultRows ?? []) {
    officialResults[row.match_key] = {
      winnerRef: row.winner_ref,
      voided: row.voided,
    };
  }
  const hasOfficial = Object.keys(officialResults).length > 0;

  const schedule: Record<string, MatchScheduleRow> = {};
  for (const row of scheduleRows ?? []) {
    if (!row.match_key || !row.scheduled_at) continue;
    schedule[row.match_key] = {
      scheduled_at: row.scheduled_at,
      has_time: Boolean(row.has_time),
    };
  }

  const surface = String(tournament.surface ?? "hard").toLowerCase();
  const courtTone = surface.includes("clay")
    ? "clay"
    : surface.includes("grass")
      ? "grass"
      : "hard";

  return (
    <AppShell signedIn email={user.email} arena>
      <div className={`page page--court page--court-${courtTone}`}>
        <header className="page-header page-header--split page-header--court">
          <div className="page-header-copy">
            <p className="eyebrow">
              {solo ? t("league.solo.eyebrow") : league.name}
            </p>
            <h1 className="t-page-title">
              {tf("bracket.page.title", { name: tournament.name })}
            </h1>
            <p className="t-lead">
              <span className="numeral">
                {whenCaption(tournament, getLocale())}
              </span>
              {" · "}
              {locked && hasOfficial
                ? t("bracket.page.lockedLede")
                : locked
                  ? t("bracket.page.lockedReadOnly")
                  : t("bracket.page.editLede")}
            </p>
          </div>
          <div className="page-actions">
            <Link
              href={`/leagues/${league.slug}/t/${tournament.ref}`}
              className="act act--standard act--standard-size"
            >
              {t("common.tournament")}
            </Link>
            <Link href={`/leagues/${league.slug}`} className="act act--quiet">
              {solo ? t("league.solo.home") : t("common.leagueHome")}
            </Link>
          </div>
        </header>

        <div className="bracket-stage">
          <BracketEditor
            leagueId={league.id}
            leagueSlug={league.slug}
            tournamentId={tournament.id}
            tournamentRef={tournament.ref}
            drawSize={tournament.draw_size}
            seats={seats}
            initialPicks={picks}
            initialConfidence={confidence}
            submittedAt={bracket?.submitted_at ?? null}
            locked={locked}
            platformLocked={platformLocked}
            isCommissioner={membership.role === "commissioner"}
            officialResults={officialResults}
            schedule={schedule}
            venueTz={
              (tournament as { venue_tz?: string | null }).venue_tz || "UTC"
            }
            showSoloInvite={solo && membership.role === "commissioner"}
          />
        </div>
      </div>
    </AppShell>
  );
}
