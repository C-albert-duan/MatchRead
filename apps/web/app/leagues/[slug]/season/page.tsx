import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LiveRefresh } from "@/components/LiveRefresh";
import { StandingsTable } from "@/components/StandingsTable";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: { slug: string };
};

export default async function SeasonStandingsPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/leagues/${params.slug}/season`)}`
    );
  }

  const supabase = createClient();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, slug, name, format")
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

  const { data: rows } = await supabase
    .from("season_standings")
    .select("user_id, points, position, previous_position, points_delta")
    .eq("league_id", league.id)
    .order("position", { ascending: true });

  const standingRows = (rows ?? []).map((r) => ({
    user_id: r.user_id,
    score: r.points,
    position: r.position,
    previous_position: r.previous_position,
    score_delta: r.points_delta,
    position_delta:
      r.previous_position != null && r.position != null
        ? r.previous_position - r.position
        : null,
    label: r.user_id === user.id ? "You" : `${r.user_id.slice(0, 8)}…`,
    isYou: r.user_id === user.id,
  }));

  return (
    <AppShell signedIn email={user.email}>
      <LiveRefresh enabled={standingRows.length > 0} />
      <div className="stack gap-4xl">
        <div className="stack gap-lg">
          <p className="eyebrow">Season</p>
          <h1 className="t-page-title">{league.name}</h1>
          <p className="t-lead">
            Points are scaled per event so a perfect 250 equals a perfect Slam
            on the table — weight changes the season total, not the grade.
          </p>
          <div className="row wrap gap-md">
            <Link
              href={`/leagues/${league.slug}`}
              className="act act--standard act--standard-size"
            >
              League home
            </Link>
          </div>
        </div>

        <section className="stack gap-lg" aria-labelledby="season-heading">
          <h2 id="season-heading" className="section-title">
            Season standings
          </h2>
          <StandingsTable rows={standingRows} kind="season" />
        </section>
      </div>
    </AppShell>
  );
}
