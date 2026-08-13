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
import { isTournamentLocked, loadLeagueDrawLock } from "@/lib/brackets/types";
import { getLocale, t } from "@/lib/i18n";
import { isSoloPresentation } from "@/lib/leagues/solo";
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
    .select("id, slug, name, format, tournament_label, is_solo")
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

  await redirectIfMissingDisplayName(
    supabase,
    user.id,
    `/leagues/${params.slug}/t/${params.ref}`
  );

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("ref", params.ref)
    .maybeSingle();

  if (!tournament) notFound();

  if (
    league.format === "single" &&
    league.tournament_label &&
    league.tournament_label !== tournament.name
  ) {
    notFound();
  }

  const { data: draw } = await supabase
    .from("draws")
    .select("id, published_at")
    .eq("tournament_id", tournament.id)
    .maybeSingle();

  const isCommissioner = membership.role === "commissioner";
  const isFounder = isFounderEmail(user.email ?? undefined);
  const liveFeed = Boolean(
    (tournament as { provider_tournament_id?: string | null })
      .provider_tournament_id
  );
  // Manual Official Results UI only for fixture tournaments without a provider.
  const showManualResults = isCommissioner && !liveFeed;

  const [bracketRes, snapshotsRes, seatsRes, resultsRes, scheduleRes, leagueLockedAt, matchupsRes] =
    await Promise.all([
    supabase
      .from("brackets")
      .select("submitted_at, updated_at, picks")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("bracket_snapshots")
      .select(
        "user_id, score, position, previous_position, position_delta, score_delta, upside, champion_alive"
      )
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .order("position", { ascending: true }),
    showManualResults && draw
      ? supabase
          .from("draw_seats")
          .select(
            "position, player_ref, last_name, seed, country_code, is_bye"
          )
          .eq("draw_id", draw.id)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as Array<{
          position: number;
          player_ref: string;
          last_name: string;
          seed: number | null;
          country_code: string;
          is_bye: boolean;
        }> }),
    showManualResults
      ? supabase
          .from("match_results")
          .select("match_key, winner_ref, voided")
          .eq("tournament_id", tournament.id)
      : Promise.resolve({
          data: [] as Array<{
            match_key: string;
            winner_ref: string | null;
            voided: boolean;
          }>,
        }),
    showManualResults
      ? supabase
          .from("match_schedule")
          .select("match_key, scheduled_at, has_time")
          .eq("tournament_id", tournament.id)
      : Promise.resolve({
          data: [] as Array<{
            match_key: string;
            scheduled_at: string;
            has_time: boolean;
          }>,
        }),
    loadLeagueDrawLock(supabase, league.id, tournament.id),
    supabase
      .from("announced_matchups")
      .select(
        "match_key, player1_ref, player1_last_name, player1_seed, player2_ref, player2_last_name, player2_seed, scheduled_at, has_time"
      )
      .eq("tournament_id", tournament.id)
      .order("scheduled_at", { ascending: true }),
  ]);

  const bracket = bracketRes.data;
  const snapshots = snapshotsRes.data;
  const seats = seatsRes.data ?? [];
  const initialResults: Record<string, string> = {};
  for (const row of resultsRes.data ?? []) {
    if (!row.voided && row.winner_ref) {
      initialResults[row.match_key] = row.winner_ref;
    }
  }
  const schedule: Record<string, MatchScheduleRow> = {};
  for (const row of scheduleRes.data ?? []) {
    if (!row.match_key || !row.scheduled_at) continue;
    schedule[row.match_key] = {
      scheduled_at: row.scheduled_at,
      has_time: Boolean(row.has_time),
    };
  }

  const locked = isTournamentLocked({
    ...tournament,
    league_locked_at: leagueLockedAt,
  });
  const hasDraw = Boolean(draw);
  const bracketHref = `/leagues/${league.slug}/t/${tournament.ref}/bracket`;

  let bracketLabel = t("tournament.openBracket");
  if (locked) bracketLabel = t("tournament.viewBracket");
  else if (bracket?.submitted_at || bracket?.updated_at)
    bracketLabel = t("tournament.reviewBracket");

  const standingNames = await loadDisplayNames(
    supabase,
    (snapshots ?? []).map((s) => s.user_id)
  );

  const standingRows = (snapshots ?? []).map((s) => ({
    user_id: s.user_id,
    score: s.score,
    position: s.position,
    previous_position: s.previous_position,
    score_delta: s.score_delta,
    position_delta: s.position_delta,
    upside: s.upside,
    champion_alive: s.champion_alive,
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
              {solo
                ? t("league.solo.eyebrow")
                : league.name}
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
                {whenCaption(tournament, getLocale())}
              </span>
            </p>
          </div>
          <div className="page-actions">
            {hasDraw ? (
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
              {solo ? t("league.solo.eyebrow") : t("tournament.leagueHome")}
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

        {!hasDraw && (matchupsRes.data?.length ?? 0) > 0 ? (
          <AnnouncedFirstRound
            matchups={matchupsRes.data ?? []}
            expectedFirst={Math.max(Math.floor(Number(tournament.draw_size || 64) / 2), 16)}
            picks={(bracket?.picks ?? {}) as Record<string, string>}
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
          <section className="section focus-band" style={{ borderTop: "none", paddingTop: 0 }}>
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
                      {standingRows[0]?.upside != null
                        ? ` · +${standingRows[0].upside} upside`
                        : ""}
                    </p>
                    <div className="page-actions">
                      <Link
                        href={`/leagues/${league.slug}/t/${tournament.ref}/result`}
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
                      href={`/leagues/${league.slug}/t/${tournament.ref}/result`}
                      className="act act--standard act--standard-size"
                    >
                      {t("tournament.seeResult")}
                    </Link>
                  </div>
                ) : null}
              </>
            )}
            {/* Ops: commissioner only. Live-feed tournaments ingest winners
                via RapidAPI — no manual Official Results panel. */}
            {isCommissioner ? (
              <>
                {showManualResults ? (
                  <OfficialResultsPanel
                    leagueId={league.id}
                    leagueSlug={league.slug}
                    tournamentId={tournament.id}
                    tournamentRef={tournament.ref}
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
                  tournamentRef={tournament.ref}
                />
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
