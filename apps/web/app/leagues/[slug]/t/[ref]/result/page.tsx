import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ordinal } from "@matchread/core";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";
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

  const { data: snap } = await supabase
    .from("bracket_snapshots")
    .select(
      "score, position, max_score, champion_ref, champion_alive, correct, incorrect"
    )
    .eq("league_id", league.id)
    .eq("tournament_id", tournament.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { count: fieldSize } = await supabase
    .from("bracket_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("league_id", league.id)
    .eq("tournament_id", tournament.id);

  const { data: season } = await supabase
    .from("season_standings")
    .select("position, points")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();

  let championName: string | null = null;
  if (snap?.champion_ref) {
    const { data: draw } = await supabase
      .from("draws")
      .select("id")
      .eq("tournament_id", tournament.id)
      .maybeSingle();
    if (draw) {
      const { data: seat } = await supabase
        .from("draw_seats")
        .select("last_name")
        .eq("draw_id", draw.id)
        .eq("player_ref", snap.champion_ref)
        .maybeSingle();
      championName = seat?.last_name ?? snap.champion_ref;
    }
  }

  const maxScore = snap?.max_score || 1;
  const percent = snap
    ? Math.round((snap.score / maxScore) * 100)
    : null;

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-4xl">
        <div className="stack gap-lg">
          <p className="eyebrow">{league.name}</p>
          <h1 className="t-page-title">Result</h1>
          <p className="t-lead">{tournament.name}</p>
        </div>

        {!snap ? (
          <section className="panel stack gap-md">
            <h2 className="section-title">Not yet available</h2>
            <p className="t-body">
              Your result appears here after settlement grades submitted
              brackets.
            </p>
            <Link
              href={`/leagues/${league.slug}/t/${tournament.ref}`}
              className="act act--standard act--standard-size"
            >
              Tournament
            </Link>
          </section>
        ) : (
          <article className="artifact stack gap-2xl">
            <div className="artifact-mark">
              <span>MatchRead</span>
              <span className="t-caption">· {tournament.name}</span>
            </div>
            <div className="stack gap-md">
              <p className="eyebrow">Final place</p>
              <p className="artifact-place numeral">
                {ordinal(snap.position ?? 0)}
                <span className="artifact-field">
                  {" "}
                  of {fieldSize ?? "—"}
                </span>
              </p>
              <p className="t-lead">
                Score{" "}
                <span className="numeral">
                  {snap.score} / {maxScore}
                </span>
                {percent != null ? ` · ${percent}% of perfect` : ""}
              </p>
            </div>
            <dl className="meta-grid">
              <div>
                <dt className="t-caption">Correct</dt>
                <dd className="numeral">{snap.correct}</dd>
              </div>
              <div>
                <dt className="t-caption">Misses</dt>
                <dd className="numeral">{snap.incorrect}</dd>
              </div>
              <div>
                <dt className="t-caption">Champion</dt>
                <dd>
                  {championName ?? "—"}
                  {snap.champion_alive === true
                    ? " · won it"
                    : snap.champion_alive === false
                      ? " · out"
                      : ""}
                </dd>
              </div>
              {season?.position != null ? (
                <div>
                  <dt className="t-caption">Season</dt>
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
        )}

        <div className="row wrap gap-md">
          <Link
            href={`/leagues/${league.slug}`}
            className="act act--standard act--standard-size"
          >
            League home
          </Link>
          <Link
            href={`/leagues/${league.slug}/t/${tournament.ref}`}
            className="act act--standard act--standard-size"
          >
            Tournament
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
