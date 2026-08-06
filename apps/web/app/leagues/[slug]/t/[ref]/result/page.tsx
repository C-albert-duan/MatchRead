import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ordinal,
  type BracketPicks,
  type DrawSeat,
  type OfficialResults,
} from "@matchread/core";
import { ResultPickBreakdown } from "@/components/league/ResultPickBreakdown";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

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

  const [
    { data: snap },
    { count: fieldSize },
    { data: myBracket },
    { count: resultCount },
    { data: draw },
    { data: resultRows },
  ] = await Promise.all([
    supabase
      .from("bracket_snapshots")
      .select(
        "score, position, max_score, champion_ref, champion_alive, correct, incorrect"
      )
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("bracket_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id),
    supabase
      .from("brackets")
      .select("submitted_at, picks")
      .eq("league_id", league.id)
      .eq("tournament_id", tournament.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("match_results")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournament.id),
    supabase
      .from("draws")
      .select("id")
      .eq("tournament_id", tournament.id)
      .maybeSingle(),
    supabase
      .from("match_results")
      .select("match_key, winner_ref, voided")
      .eq("tournament_id", tournament.id),
  ]);

  const { data: season } = await supabase
    .from("season_standings")
    .select("position, points")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();

  let seats: DrawSeat[] = [];
  if (draw) {
    const { data: seatRows } = await supabase
      .from("draw_seats")
      .select("position, player_ref, last_name, seed, country_code, is_bye")
      .eq("draw_id", draw.id)
      .order("position", { ascending: true });
    seats = (seatRows ?? []) as DrawSeat[];
  }

  let championName: string | null = null;
  if (snap?.champion_ref) {
    const seat = seats.find((s) => s.player_ref === snap.champion_ref);
    championName = seat?.last_name ?? snap.champion_ref;
  }

  const official: OfficialResults = {};
  for (const row of resultRows ?? []) {
    official[row.match_key] = {
      winnerRef: row.winner_ref,
      voided: row.voided,
    };
  }

  const picks = (myBracket?.picks ?? {}) as BracketPicks;
  const maxScore = snap?.max_score || 1;
  const percent = snap ? Math.round((snap.score / maxScore) * 100) : null;

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">{league.name}</p>
            <h1 className="t-page-title">{t("result.title")}</h1>
            <p className="t-lead">{tournament.name}</p>
          </div>
          <div className="page-actions">
            <Link
              href={`/leagues/${league.slug}/t/${tournament.ref}`}
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
                href={`/leagues/${league.slug}/t/${tournament.ref}/bracket`}
                className="act act--prominent act--standard-size"
              >
                {t("result.myBracket")}
              </Link>
              <Link
                href={`/leagues/${league.slug}/t/${tournament.ref}`}
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
                <p className="eyebrow">{t("result.finalPlace")}</p>
                <p className="artifact-place numeral">
                  {ordinal(snap.position ?? 0)}
                  <span className="artifact-field">
                    {" "}
                    of {fieldSize ?? "—"}
                  </span>
                </p>
                <p className="t-lead">
                  {t("result.score")}{" "}
                  <span className="numeral">
                    {snap.score} / {maxScore}
                  </span>
                  {percent != null ? ` · ${percent}% ${t("result.ofPerfect")}` : ""}
                </p>
              </div>
              <dl className="meta-grid">
                <div>
                  <dt className="t-caption">{t("result.correct")}</dt>
                  <dd className="numeral stat--good">{snap.correct}</dd>
                </div>
                <div>
                  <dt className="t-caption">{t("result.misses")}</dt>
                  <dd className="numeral stat--miss">{snap.incorrect}</dd>
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
                {season?.position != null ? (
                  <div>
                    <dt className="t-caption">{t("result.season")}</dt>
                    <dd>
                      {ordinal(season.position)}
                      {season.points != null
                        ? ` · ${season.points.toLocaleString("en-GB")} pts`
                        : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </article>

            <ResultPickBreakdown
              drawSize={tournament.draw_size as number}
              picks={picks}
              official={official}
              seats={seats}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
