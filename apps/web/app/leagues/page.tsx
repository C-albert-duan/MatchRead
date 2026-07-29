import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import type { LeagueListItem, MemberRole } from "@/lib/leagues/types";

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
    for (const row of rows) {
      const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
      if (!league) continue;

      const { count } = await supabase
        .from("league_members")
        .select("*", { count: "exact", head: true })
        .eq("league_id", league.id);

      leagues.push({
        ...league,
        member_count: count ?? 1,
        role: row.role as MemberRole,
      });
    }
  }

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-2xl">
        <div className="row wrap between gap-md">
          <div className="stack gap-lg">
            <p className="eyebrow">Leagues</p>
            <h1 className="t-page-title">My leagues</h1>
            <p className="t-lead">
              The groups you belong to. The one with something happening should
              feel first — for now, newest membership wins.
            </p>
          </div>
          <Link
            href="/leagues/new"
            className="act act--prominent act--prominent-size"
          >
            Start a league
          </Link>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            Could not load leagues. If you just set up Supabase, apply the Phase
            2 migration in the SQL Editor (
            <code>docs/SUPABASE-SETUP.md</code>).
            <br />
            <span className="t-caption">{error.message}</span>
          </p>
        ) : null}

        {!error && leagues.length === 0 ? (
          <div className="panel stack gap-lg">
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
          <ul className="league-list">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link href={`/leagues/${league.slug}`} className="league-card">
                  <span className="stack gap-sm" style={{ flex: 1, minWidth: 0 }}>
                    <span className="league-card-name">{league.name}</span>
                    <span className="t-caption">
                      {league.format === "single"
                        ? league.tournament_label ?? "Single tournament"
                        : "Season league"}
                      {" · "}
                      {league.visibility}
                      {" · "}
                      {league.member_count}{" "}
                      {league.member_count === 1 ? "member" : "members"}
                      {league.role === "commissioner" ? " · commissioner" : ""}
                    </span>
                  </span>
                  <span className="t-caption">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppShell>
  );
}
