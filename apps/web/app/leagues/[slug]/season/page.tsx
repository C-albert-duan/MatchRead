import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { rankRows } from "@matchread/core";
import { AppShell } from "@/components/shell/AppShell";
import { StandingsTable } from "@/components/league/StandingsTable";
import { getSessionUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { loadDisplayNames, memberLabel } from "@/lib/profiles/labels";
import { redirectIfMissingDisplayName } from "@/lib/profiles/require-name";

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
    .from("members")
    .select("role")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) notFound();

  await redirectIfMissingDisplayName(
    supabase,
    user.id,
    `/leagues/${params.slug}/season`
  );

  const { data: rows } = await supabase
    .from("season_points")
    .select("user_id, points")
    .eq("league_id", league.id);

  const ranked = rankRows(
    (rows ?? []).map((r) => ({
      userId: r.user_id,
      score: r.points ?? 0,
      tieBreak: r.user_id,
    }))
  );

  const names = await loadDisplayNames(
    supabase,
    ranked.map((r) => r.userId)
  );

  const standingRows = ranked.map((r) => ({
    user_id: r.userId,
    score: r.score,
    position: r.position,
    previous_position: null as number | null,
    score_delta: null as number | null,
    position_delta: null as number | null,
    label: memberLabel(r.userId, user.id, names),
    isYou: r.userId === user.id,
  }));

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">{t("season.title")}</p>
            <h1 className="t-page-title">{league.name}</h1>
            <p className="t-lead">{t("season.lede")}</p>
          </div>
          <div className="page-actions">
            <Link
              href={`/leagues/${league.slug}`}
              className="act act--prominent act--standard-size"
            >
              {t("common.leagueHome")}
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
