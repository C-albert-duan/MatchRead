import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { LiveRefresh } from "@/components/shell/LiveRefresh";
import { OfficialResultsPanel } from "@/components/league/OfficialResultsPanel";
import { SettleButton } from "@/components/league/SettleButton";
import { StandingsTable } from "@/components/league/StandingsTable";
import { getSessionUser } from "@/lib/auth";
import { isFounderEmail } from "@/lib/auth/founder";
import { isTournamentLocked } from "@/lib/brackets/types";
import { t } from "@/lib/i18n";
import { loadDisplayNames, memberLabel } from "@/lib/profiles/labels";
import { redirectIfMissingDisplayName } from "@/lib/profiles/require-name";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, slug, name, format, tournament_label")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!league) notFound();

  const { data: membership } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) notFound();

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

  const [bracketRes, snapshotsRes, seatsRes, resultsRes] = await Promise.all([
    supabase
      .from("brackets")
      .select("submitted_at, updated_at")
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
    isCommissioner && draw
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
    isCommissioner
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

  const locked = isTournamentLocked(tournament);
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
            <p className="eyebrow">{league.name}</p>
            <h1 className="t-page-title">{tournament.name}</h1>
            <p className="t-lead">
              {tournament.surface} court
              {tournament.starts_on ? ` · starts ${tournament.starts_on}` : ""}
              {tournament.lock_at
                ? ` · locks ${new Date(tournament.lock_at).toUTCString()}`
                : ""}
              {locked ? " · locked" : ""}
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
              {t("tournament.leagueHome")}
            </Link>
            <Link
              href={`/leagues/${league.slug}/season`}
              className="act act--quiet"
            >
              {t("league.seasonStandings")}
            </Link>
          </div>
        </header>

        {!hasDraw ? (
          <section
            className="panel stack gap-md focus-band"
            aria-labelledby="draw-pending"
          >
            <h2 id="draw-pending" className="section-title">
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
              {t("tournament.eventStandings")}
            </h2>
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
            {/* Ops controls: commissioner only — never invitees/members.
                (When FOUNDER_EMAILS is unset, every user is "founder"; do not
                use that flag to show this panel.) */}
            {isCommissioner ? (
              <>
                <OfficialResultsPanel
                  leagueId={league.id}
                  leagueSlug={league.slug}
                  tournamentId={tournament.id}
                  tournamentRef={tournament.ref}
                  drawSize={tournament.draw_size}
                  seats={seats}
                  initialResults={initialResults}
                  isFounder={isFounder}
                />
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
