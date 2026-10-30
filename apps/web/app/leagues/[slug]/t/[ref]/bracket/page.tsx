import { buildRoundStructure, isOfficialPublicDraw, type DrawSeat } from "@matchread/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { publicPageMetadata } from "@/lib/seo";
import type { OfficialResults } from "@matchread/core";
import { AppShell } from "@/components/shell/AppShell";
import { AnnouncedFirstRound } from "@/components/bracket/AnnouncedFirstRound";
import { BracketScroller } from "@/components/bracket/BracketScroller";
import { BracketEditor } from "@/components/bracket/BracketEditor";
import { getSessionUser } from "@/lib/auth";
import { loadTournamentReadModel } from "@/lib/brackets/read-model";
import {
  effectiveDrawSize,
  isPlatformLocked,
  isTournamentLocked,
  loadLeagueDrawLock,
} from "@/lib/brackets/types";
import { getLocale, t, tf } from "@/lib/i18n";
import { isSoloPresentation } from "@/lib/leagues/solo";
import {
  isCustomSchedule,
  leagueIncludesTournament,
  leagueUsesSchedule,
} from "@/lib/leagues/covers";
import { loadScheduledIds } from "@/lib/leagues/scheduled";
import { createClient } from "@/lib/supabase/server";
import type { MatchScheduleRow } from "@/lib/tournaments/calendar";
import { relevantRoundIndex } from "@/lib/brackets/layout";
import { WhenCaption } from "@/components/tournaments/EntryLockWhen";
import { timeLabels } from "@/lib/tournaments/when";

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
    .select("id, slug, name, format, schedule_mode, is_solo")
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
    leagueUsesSchedule(league) &&
    !leagueIncludesTournament(
      {
        format: league.format,
        schedule_mode: league.schedule_mode,
        tournament_id: linked?.tournament_id ?? null,
        scheduled_ids: isCustomSchedule(league)
          ? await loadScheduledIds(supabase, league.id)
          : null,
      },
      tournament.id
    )
  ) {
    notFound();
  }

  const tournamentRef = tournament.slug as string;

  const [sheet, leagueLockedAt] = await Promise.all([
    loadTournamentReadModel(supabase, tournament.id, {
      leagueId: league.id,
      userId: user.id,
    }),
    loadLeagueDrawLock(supabase, league.id, tournament.id),
  ]);
  const {
    seats,
    announced,
    official: officialMap,
    schedule: scheduleMap,
    picks,
    confidence,
    entry,
  } = sheet;

  const drawSize = effectiveDrawSize(
    seats.length,
    Number(tournament.draw_size) || 0
  );
  const hasSheet =
    Boolean(tournament.published_at) &&
    isOfficialPublicDraw(seats, drawSize);
  const locked = isTournamentLocked({
    lock_at: tournament.lock_at,
    admin_locked_at: null,
    league_locked_at: leagueLockedAt,
    hasOfficialDraw: hasSheet,
  });

  // Full bracket only for official sheet; else announced R0 facts or redirect.
  if (!hasSheet) {
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
            expectedFirst={Math.max(Math.floor(drawSize / 2) || 16, 16)}
            picks={picks}
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
  const relevantRound = relevantRoundIndex(
    buildRoundStructure(drawSize).flatMap((round) =>
      round.matches.map((match) => {
        const result = officialResults[match.key];
        return {
          round: match.round,
          official: Boolean(result?.voided || result?.winnerRef),
        };
      })
    )
  );
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
                <WhenCaption
                  row={{ ...tournament, hasDraw: true }}
                  locale={getLocale()}
                  labels={timeLabels()}
                />
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

        <BracketScroller relevantRound={relevantRound}>
          <BracketEditor
            leagueId={league.id}
            leagueSlug={league.slug}
            tournamentId={tournament.id}
            tournamentRef={tournamentRef}
            drawSize={drawSize}
            seats={seats as DrawSeat[]}
            initialPicks={picks}
            initialConfidence={confidence}
            submittedAt={entry?.submittedAt ?? null}
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
        </BracketScroller>
      </div>
    </AppShell>
  );
}
