import { isOfficialPublicDraw } from "@matchread/core";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { LiveRefresh } from "@/components/shell/LiveRefresh";
import { OfficialResultsPanel } from "@/components/league/OfficialResultsPanel";
import { SettleButton } from "@/components/league/SettleButton";
import { StandingsTable } from "@/components/league/StandingsTable";
import { AnnouncedFirstRound } from "@/components/bracket/AnnouncedFirstRound";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { getSessionUser } from "@/lib/auth";
import { isFounderEmail } from "@/lib/auth/founder";
import {
  isTournamentLocked,
  loadAnnouncedMatchups,
  loadBracketPicksMap,
  loadLeagueDrawLock,
  loadMatchScheduleMap,
  loadOfficialResultsMap,
  loadTournamentSeats,
} from "@/lib/brackets/types";
import { getLocale, t } from "@/lib/i18n";
import { isSoloPresentation } from "@/lib/leagues/solo";
import { leagueIncludesTournament } from "@/lib/leagues/covers";
import { loadDisplayNames, memberLabel } from "@/lib/profiles/labels";
import { redirectIfMissingDisplayName } from "@/lib/profiles/require-name";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeTour,
  type MatchScheduleRow,
} from "@/lib/tournaments/calendar";
import { whenCaption } from "@/lib/tournaments/when";

type Props = {
  params: { slug: string; ref: string };
};

async function loadLeagueTournamentId(
  supabase: ReturnType<typeof createClient>,
  leagueId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("league_tournaments")
    .select("tournament_id")
    .eq("league_id", leagueId)
    .limit(1)
    .maybeSingle();
  return data?.tournament_id ?? null;
}

export default async function TournamentInLeaguePage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/leagues/${params.slug}/t/${params.ref}`)}`
    );
  }

  const supabase = createClient();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, slug, name, format, owner_id, is_solo")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!league) notFound();

  const [{ data: membership }, { count: memberCount }, linkedTournamentId] =
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
      loadLeagueTournamentId(supabase, league.id),
    ]);

  if (!membership) notFound();

  const solo = isSoloPresentation({
    is_solo: Boolean(league.is_solo),
    member_count: memberCount ?? 1,
  });

  await redirectIfMissingDisplayName(
    supabase,
    user.id,
    `/leagues/${params.slug}/t/${params.ref}`
  );

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("slug", params.ref)
    .maybeSingle();

  if (!tournament) notFound();

  if (
    league.format === "single" &&
    !leagueIncludesTournament(
      { format: league.format, tournament_id: linkedTournamentId },
      tournament.id
    )
  ) {
    notFound();
  }

  const isCommissioner = membership.role === "commissioner";
  const isFounder = isFounderEmail(user.email ?? undefined);
  // Manual Official Results UI only when no provider feed (rare / ops).
  const showManualResults =
    isCommissioner && !(tournament as { provider_id?: string | null }).provider_id;

  const [
    bracketRes,
    scoredRes,
    seats,
    officialMap,
    scheduleMap,
    leagueLockedAt,
    announced,
  ] = await Promise.all([
    supabase
      .from("brackets")
      .select("id, submitted_at, updated_at")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("brackets")
      .select(
        "user_id, points, rank, champion_player_id"
      )
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .not("points", "is", null)
      .order("rank", { ascending: true }),
    loadTournamentSeats(supabase, tournament.id),
    showManualResults
      ? loadOfficialResultsMap(supabase, tournament.id)
      : Promise.resolve({} as Awaited<ReturnType<typeof loadOfficialResultsMap>>),
    showManualResults
      ? loadMatchScheduleMap(supabase, tournament.id)
      : Promise.resolve({} as Awaited<ReturnType<typeof loadMatchScheduleMap>>),
    loadLeagueDrawLock(supabase, league.id, tournament.id),
    loadAnnouncedMatchups(supabase, tournament.id),
  ]);

  const bracket = bracketRes.data;
  const picks = bracket?.id
    ? await loadBracketPicksMap(supabase, bracket.id)
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
  const hasDraw = official;

  const initialResults: Record<string, string> = {};
  for (const [key, row] of Object.entries(officialMap)) {
    if (!row.voided && row.winnerRef) {
      initialResults[key] = row.winnerRef;
    }
  }
  const schedule: Record<string, MatchScheduleRow> = scheduleMap;

  const tournamentRef = tournament.slug as string;
  const canOpenBracket = hasDraw || announced.length > 0;
  const bracketHref = `/leagues/${league.slug}/t/${tournamentRef}/bracket`;

  let bracketLabel = t("tournament.openBracket");
  if (locked) bracketLabel = t("tournament.viewBracket");
  else if (bracket?.submitted_at || bracket?.updated_at)
    bracketLabel = t("tournament.reviewBracket");

  const standingNames = await loadDisplayNames(
    supabase,
    (scoredRes.data ?? []).map((s) => s.user_id)
  );

  const standingRows = (scoredRes.data ?? []).map((s) => ({
    user_id: s.user_id,
    score: s.points ?? 0,
    position: s.rank,
    previous_position: null as number | null,
    score_delta: null as number | null,
    position_delta: null as number | null,
    upside: null as number | null,
    champion_alive: null as boolean | null,
    label: memberLabel(s.user_id, user.id, standingNames),
    isYou: s.user_id === user.id,
  }));

  return (
    <AppShell signedIn email={user.email}>
      <LiveRefresh enabled={hasDraw} />
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">
              {solo ? t("league.solo.eyebrow") : league.name}
            </p>
            <h1 className="t-page-title">{tournament.name}</h1>
            <p className="t-lead">
              <TourLabel
                tour={normalizeTour(
                  (tournament as { tour?: string | null }).tour
                )}
              />
              {" · "}
              {tournament.surface} court
              {" · "}
              <span className="numeral">
                {whenCaption({ ...tournament, hasDraw }, getLocale())}
              </span>
            </p>
          </div>
          <div className="page-actions">
            {canOpenBracket ? (
              <Link
                href={bracketHref}
                className="act act--prominent act--prominent-size"
              >
                {bracketLabel}
              </Link>
            ) : null}
            <Link
              href={`/leagues/${league.slug}`}
              className="act act--standard act--standard-size"
            >
              {solo ? t("league.solo.home") : t("tournament.leagueHome")}
            </Link>
            {!solo ? (
              <Link
                href={`/leagues/${league.slug}/season`}
                className="act act--quiet"
              >
                {t("league.seasonStandings")}
              </Link>
            ) : null}
          </div>
        </header>

        {!hasDraw && announced.length > 0 ? (
          <AnnouncedFirstRound
            matchups={announced}
            expectedFirst={Math.max(
              Math.floor(Number(tournament.draw_size || 64) / 2),
              16
            )}
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
        ) : !hasDraw ? (
          <section
            className="panel stack gap-md focus-band"
            aria-labelledby="draw-pending-empty"
          >
            <h2 id="draw-pending-empty" className="section-title">
              {t("tournament.drawPending.title")}
            </h2>
            <p className="t-body">{t("tournament.drawPending.body")}</p>
          </section>
        ) : (
          <section
            className="section focus-band"
            style={{ borderTop: "none", paddingTop: 0 }}
          >
            <h2 className="section-title">{t("tournament.yourEntry")}</h2>
            <p className="t-body">
              {locked
                ? t("tournament.entry.locked")
                : bracket?.submitted_at
                  ? t("tournament.entry.submitted")
                  : t("tournament.entry.draft")}
            </p>
          </section>
        )}

        {hasDraw ? (
          <section className="section" aria-labelledby="event-standings">
            <h2 id="event-standings" className="section-title">
              {solo
                ? t("tournament.solo.scoreTitle")
                : t("tournament.eventStandings")}
            </h2>
            {solo ? (
              <>
                {standingRows.length > 0 ? (
                  <>
                    <p className="t-lead numeral">
                      {standingRows[0]?.score ?? 0}
                    </p>
                    <div className="page-actions">
                      <Link
                        href={`/leagues/${league.slug}/t/${tournamentRef}/result`}
                        className="act act--standard act--standard-size"
                      >
                        {t("tournament.seeResult")}
                      </Link>
                      <Link
                        href={`/leagues/${league.slug}?invite=1`}
                        className="act act--quiet"
                      >
                        {t("bracket.solo.invite.cta")}
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="t-body">{t("tournament.solo.noStandings")}</p>
                )}
              </>
            ) : (
              <>
                <StandingsTable rows={standingRows} kind="event" />
                {standingRows.length > 0 ? (
                  <div className="page-actions">
                    <Link
                      href={`/leagues/${league.slug}/t/${tournamentRef}/result`}
                      className="act act--standard act--standard-size"
                    >
                      {t("tournament.seeResult")}
                    </Link>
                  </div>
                ) : null}
              </>
            )}
            {isCommissioner ? (
              <>
                {showManualResults ? (
                  <OfficialResultsPanel
                    leagueId={league.id}
                    leagueSlug={league.slug}
                    tournamentId={tournament.id}
                    tournamentRef={tournamentRef}
                    drawSize={tournament.draw_size}
                    seats={seats}
                    initialResults={initialResults}
                    isFounder={isFounder}
                    schedule={schedule}
                    venueTz={
                      (tournament as { venue_tz?: string | null }).venue_tz ||
                      "UTC"
                    }
                  />
                ) : null}
                <SettleButton
                  leagueId={league.id}
                  leagueSlug={league.slug}
                  tournamentId={tournament.id}
                  tournamentRef={tournamentRef}
                />
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
