import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { LiveRefresh } from "@/components/shell/LiveRefresh";
import { StandingsTable } from "@/components/league/StandingsTable";
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
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">Season standings</p>
            <h1 className="t-page-title">{league.name}</h1>
            <p className="t-lead">
              Did you move? Points are scaled per event so a perfect 250 equals
              a perfect Slam on the table.
            </p>
          </div>
          <div className="page-actions">
            <Link
              href={`/leagues/${league.slug}`}
              className="act act--prominent act--standard-size"
            >
              League home
            </Link>
          </div>
        </header>

        <div className="focus-band">
          <StandingsTable rows={standingRows} kind="season" />
        </div>
      </div>
    </AppShell>
  );
}
