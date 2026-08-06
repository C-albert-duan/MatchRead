import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth";
import { t, tf } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import type { LeagueListItem, MemberRole } from "@/lib/leagues/types";

function leagueStatus(
  league: LeagueListItem,
  drawByTournamentName: Map<string, boolean>
): string {
  if (league.format === "season") return t("leagues.status.season");
  const label = league.tournament_label;
  if (!label) return t("league.format.single");
  const hasDraw = drawByTournamentName.get(label);
  if (hasDraw === true) return t("leagues.status.bracketOpen");
  if (hasDraw === false) return t("leagues.status.awaitingDraw");
  return t("league.format.single");
}

export default async function LeaguesPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in?next=%2Fleagues");
  }

  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("league_members")
    .select(
      "role, leagues ( id, slug, name, format, visibility, tournament_label, commissioner_id, created_at )"
    )
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const leagues: LeagueListItem[] = [];

  if (rows) {
    const leagueRows: Array<{
      role: MemberRole;
      league: {
        id: string;
        slug: string;
        name: string;
        format: LeagueListItem["format"];
        visibility: LeagueListItem["visibility"];
        tournament_label: string | null;
        commissioner_id: string;
        created_at: string;
      };
    }> = [];

    for (const row of rows) {
      const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
      if (!league) continue;
      leagueRows.push({ role: row.role as MemberRole, league });
    }

    const ids = leagueRows.map((r) => r.league.id);
    const countById = new Map<string, number>();

    if (ids.length > 0) {
      const { data: allMembers } = await supabase
        .from("league_members")
        .select("league_id")
        .in("league_id", ids);
      for (const m of allMembers ?? []) {
        countById.set(m.league_id, (countById.get(m.league_id) ?? 0) + 1);
      }
    }

    for (const { role, league } of leagueRows) {
      leagues.push({
        ...league,
        member_count: countById.get(league.id) ?? 1,
        role,
      });
    }
  }

  const drawByTournamentName = new Map<string, boolean>();
  if (leagues.length > 0) {
    const [tournamentsRes, drawsRes] = await Promise.all([
      supabase.from("tournaments").select("id, name"),
      supabase.from("draws").select("tournament_id"),
    ]);
    const published = new Set(
      (drawsRes.data ?? []).map((d) => d.tournament_id as string)
    );
    for (const t of tournamentsRes.data ?? []) {
      drawByTournamentName.set(t.name, published.has(t.id));
    }
  }

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">{t("nav.leagues")}</p>
            <h1 className="t-page-title">{t("leagues.my.title")}</h1>
            <p className="t-lead">{t("leagues.my.lede")}</p>
          </div>
          <div className="page-actions">
            <Link
              href="/leagues/new"
              className="act act--prominent act--prominent-size"
            >
              {t("cta.startLeague")}
            </Link>
          </div>
        </header>

        {error ? (
          <p className="form-error" role="alert">
            Could not load leagues. Apply Phase 2 migrations (
            <code>docs/SUPABASE-SETUP.md</code>).
            <br />
            <span className="t-caption">{error.message}</span>
          </p>
        ) : null}

        {!error && leagues.length === 0 ? (
          <div className="empty-invite focus-band">
            <h2 className="t-title3">{t("leagues.empty.title")}</h2>
            <p className="t-body">{t("leagues.empty.body")}</p>
            <Link
              href="/leagues/new"
              className="act act--prominent act--prominent-size"
              style={{ alignSelf: "flex-start" }}
            >
              {t("cta.startLeague")}
            </Link>
          </div>
        ) : null}

        {leagues.length > 0 ? (
          <ul className="league-list focus-band">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link href={`/leagues/${league.slug}`} className="league-card">
                  <span className="stack gap-sm" style={{ flex: 1, minWidth: 0 }}>
                    <span className="league-card-name">{league.name}</span>
                    <span className="t-caption">
                      {league.format === "single"
                        ? league.tournament_label ?? t("league.format.single")
                        : t("league.format.season")}
                      {" · "}
                      {league.visibility}
                      {" · "}
                      {league.member_count === 1
                        ? tf("leagues.members.count.one", {
                            n: league.member_count,
                          })
                        : tf("leagues.members.count", {
                            n: league.member_count,
                          })}
                      {league.role === "commissioner"
                        ? ` · ${t("league.role.commissioner").toLowerCase()}`
                        : ""}
                    </span>
                  </span>
                  <span className="league-card-status">
                    {leagueStatus(league, drawByTournamentName)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppShell>
  );
}
