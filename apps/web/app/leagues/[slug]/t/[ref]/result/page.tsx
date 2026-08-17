import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  gradeBracket,
  maxBracketScore,
  ordinal,
  rankRows,
  type BracketPicks,
  type DrawSeat,
  type OfficialResults,
} from "@matchread/core";
import { ResultPickBreakdown } from "@/components/league/ResultPickBreakdown";
import { AppShell } from "@/components/shell/AppShell";
import { TourLabel } from "@/components/tournaments/TourLabel";
import { getSessionUser } from "@/lib/auth";
import {
  loadBracketPicksMap,
  loadOfficialResultsMap,
  loadTournamentSeats,
} from "@/lib/brackets/types";
import { getLocale, t } from "@/lib/i18n";
import { isSoloPresentation } from "@/lib/leagues/solo";
import { leagueIncludesTournament } from "@/lib/leagues/covers";
import { createClient } from "@/lib/supabase/server";
import {
  formatTournamentDate,
  normalizeTour,
} from "@/lib/tournaments/calendar";

type Props = {
  params: { slug: string; ref: string };
};

export default async function ResultArtifactPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(
        `/leagues/${params.slug}/t/${params.ref}/result`
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

  const [
    { data: myBracket },
    { count: fieldSize },
    { count: resultCount },
    seats,
    officialMap,
  ] = await Promise.all([
    supabase
      .from("brackets")
      .select("id, submitted_at, points, rank, champion_player_id")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("brackets")
      .select("*", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .not("points", "is", null),
    supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournament.id)
      .or("winner_player_id.not.is.null,voided.eq.true"),
    loadTournamentSeats(supabase, tournament.id),
    loadOfficialResultsMap(supabase, tournament.id),
  ]);

  const { data: seasonRows } = await supabase
    .from("season_points")
    .select("user_id, points")
    .eq("league_id", league.id);

  const seasonRanked = rankRows(
    (seasonRows ?? []).map((r) => ({
      userId: r.user_id,
      score: r.points ?? 0,
      tieBreak: r.user_id,
    }))
  );
  const season = seasonRanked.find((r) => r.userId === user.id);
  const seasonPoints =
    seasonRows?.find((r) => r.user_id === user.id)?.points ?? null;

  const picks: BracketPicks = myBracket?.id
    ? await loadBracketPicksMap(supabase, myBracket.id)
    : {};

  const official: OfficialResults = {};
  for (const [key, row] of Object.entries(officialMap)) {
    official[key] = row;
  }

  const drawSize = tournament.draw_size as number;
  let grade: ReturnType<typeof gradeBracket> | null = null;
  let maxScore = 1;
  try {
    maxScore = maxBracketScore(drawSize);
    if (Object.keys(picks).length > 0 && Object.keys(official).length > 0) {
      grade = gradeBracket({ drawSize, picks, official });
    }
  } catch {
    grade = null;
  }

  const snap =
    myBracket?.points != null
      ? {
          score: myBracket.points,
          position: myBracket.rank,
          max_score: maxScore,
          champion_ref: myBracket.champion_player_id,
          champion_alive: grade?.championAlive ?? null,
          correct: grade?.correct ?? null,
          incorrect: grade?.incorrect ?? null,
        }
      : null;

  let championName: string | null = null;
  if (snap?.champion_ref) {
    const seat = seats.find((s) => s.player_id === snap.champion_ref);
    championName = seat?.last_name ?? snap.champion_ref;
  }

  const percent = snap ? Math.round((snap.score / maxScore) * 100) : null;

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">
              {solo ? t("league.solo.eyebrow") : league.name}
            </p>
            <h1 className="t-page-title">{t("result.title")}</h1>
            <p className="t-lead">
              <TourLabel
                tour={normalizeTour(
                  (tournament as { tour?: string | null }).tour
                )}
              />
              {" · "}
              {tournament.name}
              {tournament.starts_on ? (
                <>
                  {" · "}
                  <span className="numeral">
                    {formatTournamentDate(
                      tournament.starts_on,
                      getLocale(),
                      (tournament as { ends_on?: string | null }).ends_on
                    )}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <div className="page-actions">
            <Link
              href={`/leagues/${league.slug}/t/${tournamentRef}`}
              className="act act--prominent act--standard-size"
            >
              {t("result.tournament")}
            </Link>
            <Link href={`/leagues/${league.slug}`} className="act act--quiet">
              {t("common.leagueHome")}
            </Link>
          </div>
        </header>

        {!snap ? (
          <section className="panel stack gap-md focus-band">
            <h2 className="section-title">{t("result.notAvailable")}</h2>
            <p className="t-body">
              {!myBracket?.submitted_at
                ? t("result.empty.submit")
                : (resultCount ?? 0) === 0
                  ? t("result.empty.noOfficial")
                  : (fieldSize ?? 0) > 0
                    ? t("result.empty.rerun")
                    : t("result.empty.settle")}
            </p>
            <p className="t-caption">{t("result.partialNote")}</p>
            <div className="page-actions">
              <Link
                href={`/leagues/${league.slug}/t/${tournamentRef}/bracket`}
                className="act act--prominent act--standard-size"
              >
                {t("result.myBracket")}
              </Link>
              <Link
                href={`/leagues/${league.slug}/t/${tournamentRef}`}
                className="act act--quiet"
              >
                {t("result.tournament")}
              </Link>
            </div>
          </section>
        ) : (
          <div className="stack gap-2xl">
            <article className="artifact stack gap-2xl focus-band">
              <div className="artifact-mark">
                <span>MatchRead</span>
                <span className="t-caption">· {tournament.name}</span>
              </div>
              <div className="stack gap-md">
                <p className="eyebrow">
                  {solo
                    ? t("result.solo.scoreEyebrow")
                    : t("result.finalPlace")}
                </p>
                {solo ? (
                  <p className="artifact-place numeral">
                    {snap.score}
                    <span className="artifact-field"> / {maxScore}</span>
                  </p>
                ) : (
                  <p className="artifact-place numeral">
                    {ordinal(snap.position ?? 0)}
                    <span className="artifact-field">
                      {" "}
                      of {fieldSize ?? "—"}
                    </span>
                  </p>
                )}
                {solo ? (
                  <p className="t-lead">
                    {percent != null
                      ? `${percent}% ${t("result.ofPerfect")}`
                      : t("result.score")}
                  </p>
                ) : (
                  <p className="t-lead">
                    {t("result.score")}{" "}
                    <span className="numeral">
                      {snap.score} / {maxScore}
                    </span>
                    {percent != null
                      ? ` · ${percent}% ${t("result.ofPerfect")}`
                      : ""}
                  </p>
                )}
              </div>
              <dl className="meta-grid">
                <div>
                  <dt className="t-caption">{t("result.correct")}</dt>
                  <dd className="numeral stat--good">{snap.correct ?? "—"}</dd>
                </div>
                <div>
                  <dt className="t-caption">{t("result.misses")}</dt>
                  <dd className="numeral stat--miss">{snap.incorrect ?? "—"}</dd>
                </div>
                <div>
                  <dt className="t-caption">{t("result.champion")}</dt>
                  <dd>
                    {championName ?? "—"}
                    {snap.champion_alive === true
                      ? ` · ${t("result.alive.won")}`
                      : snap.champion_alive === false
                        ? ` · ${t("result.alive.out")}`
                        : ""}
                  </dd>
                </div>
                {!solo && season?.position != null ? (
                  <div>
                    <dt className="t-caption">{t("result.season")}</dt>
                    <dd>
                      {ordinal(season.position)}
                      {seasonPoints != null
                        ? ` · ${seasonPoints.toLocaleString("en-GB")} pts`
                        : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </article>

            <ResultPickBreakdown
              drawSize={drawSize}
              picks={picks}
              official={official}
              seats={seats as DrawSeat[]}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
