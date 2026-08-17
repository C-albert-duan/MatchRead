import { isOfficialPublicDraw, type DrawSeat } from "@matchread/core";
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
  isPlatformLocked,
  isTournamentLocked,
  loadAnnouncedMatchups,
  loadBracketConfidenceMap,
  loadBracketPicksMap,
  loadLeagueDrawLock,
  loadMatchScheduleMap,
  loadOfficialResultsMap,
  loadTournamentSeats,
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
    .select("id, slug, name, format, is_solo")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!league) notFound();

  const [{ data: membership }, { count: memberCount }, { data: linked }] =
    await Promise.all([
      supabase
        .from("members")
        .select("role")
        .eq("league_id", league.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("league_id", league.id),
      supabase
        .from("league_tournaments")
        .select("tournament_id")
        .eq("league_id", league.id)
        .limit(1)
        .maybeSingle(),
    ]);

  if (!membership) notFound();

  const solo = isSoloPresentation({
    is_solo: Boolean(league.is_solo),
    member_count: memberCount ?? 1,
  });

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", params.ref)
    .maybeSingle();

  if (!tournament) notFound();

  if (
    league.format === "single" &&
    !leagueIncludesTournament(
      { format: league.format, tournament_id: linked?.tournament_id ?? null },
      tournament.id
    )
  ) {
    notFound();
  }

  const tournamentRef = tournament.slug as string;

  const [seats, announced, myBracketRes, leagueLockedAt] = await Promise.all([
    loadTournamentSeats(supabase, tournament.id),
    loadAnnouncedMatchups(supabase, tournament.id),
    supabase
      .from("brackets")
      .select("id, submitted_at")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    loadLeagueDrawLock(supabase, league.id, tournament.id),
  ]);

  const myBracket = myBracketRes.data;
  const announcedPicks: BracketPicks = myBracket?.id
    ? await loadBracketPicksMap(supabase, myBracket.id)
    : {};

  const official = isOfficialPublicDraw(
    seats,
    Number(tournament.draw_size) || 0
  );
  const locked = isTournamentLocked({
    lock_at: tournament.lock_at,
    admin_locked_at: null,
    league_locked_at: leagueLockedAt,
    hasOfficialDraw: official,
  });

  if (!official && !tournament.published_at) {
    if (announced.length === 0) {
      redirect(`/leagues/${league.slug}/t/${tournamentRef}`);
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
              <p className="t-lead">
                {locked
                  ? t("bracket.page.lockedReadOnly")
                  : t("bracket.page.editLede")}
              </p>
            </div>
            <div className="page-actions">
              <Link
                href={`/leagues/${league.slug}/t/${tournamentRef}`}
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
            picks={announcedPicks}
            locked={locked}
            leagueId={league.id}
            leagueSlug={league.slug}
            tournamentId={tournament.id}
            tournamentRef={tournamentRef}
            venueTz={
              (tournament as { venue_tz?: string | null }).venue_tz || "UTC"
            }
            locale={getLocale()}
          />
        </div>
      </AppShell>
    );
  }

  const [picks, confidence, officialMap, scheduleMap] = await Promise.all([
    myBracket?.id
      ? loadBracketPicksMap(supabase, myBracket.id)
      : Promise.resolve({} as BracketPicks),
    myBracket?.id
      ? loadBracketConfidenceMap(supabase, myBracket.id)
      : Promise.resolve({} as BracketConfidence),
    loadOfficialResultsMap(supabase, tournament.id),
    loadMatchScheduleMap(supabase, tournament.id),
  ]);

  const platformLocked = isPlatformLocked({
    lock_at: tournament.lock_at,
    admin_locked_at: null,
    hasOfficialDraw: true,
  });

  const officialResults: OfficialResults = {};
  for (const [key, row] of Object.entries(officialMap)) {
    officialResults[key] = row;
  }
  const hasOfficial = Object.keys(officialResults).length > 0;
  const schedule: Record<string, MatchScheduleRow> = scheduleMap;

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
                {whenCaption({ ...tournament, hasDraw: true }, getLocale())}
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
              href={`/leagues/${league.slug}/t/${tournamentRef}`}
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
            tournamentRef={tournamentRef}
            drawSize={tournament.draw_size as number}
            seats={seats as DrawSeat[]}
            initialPicks={picks}
            initialConfidence={confidence}
            submittedAt={myBracket?.submitted_at ?? null}
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
