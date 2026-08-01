import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function surfaceClass(surface: string | null | undefined) {
  const s = (surface ?? "").toLowerCase();
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  return "hard";
}

type LeagueRow = {
  slug: string;
  format: "single" | "season";
  tournament_label: string | null;
};

function hrefForTournament(
  tournamentName: string,
  tournamentRef: string,
  signedIn: boolean,
  leagues: LeagueRow[]
): string {
  if (!signedIn) {
    return `/sign-in?next=${encodeURIComponent("/leagues")}`;
  }

  const single = leagues.find(
    (l) => l.format === "single" && l.tournament_label === tournamentName
  );
  if (single) {
    return `/leagues/${single.slug}/t/${tournamentRef}`;
  }

  const season = leagues.find((l) => l.format === "season");
  if (season) {
    return `/leagues/${season.slug}/t/${tournamentRef}`;
  }

  // Signed in but no league that can open this event yet.
  return "/leagues/new";
}

export default async function TournamentsPage() {
  const user = await getSessionUser();
  const supabase = createClient();

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, ref, name, surface, starts_on, draw_size")
    .order("starts_on", { ascending: true });

  const { data: draws } = await supabase.from("draws").select("tournament_id");
  const publishedIds = new Set((draws ?? []).map((d) => d.tournament_id));

  const leagues: LeagueRow[] = [];
  if (user) {
    const { data: memberships } = await supabase
      .from("league_members")
      .select("leagues ( slug, format, tournament_label )")
      .eq("user_id", user.id);

    for (const row of memberships ?? []) {
      const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
      if (!league?.slug) continue;
      leagues.push({
        slug: league.slug,
        format: league.format as LeagueRow["format"],
        tournament_label: league.tournament_label,
      });
    }
  }

  return (
    <AppShell signedIn={Boolean(user)} email={user?.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">Calendar</p>
            <h1 className="t-page-title">Tournament calendar</h1>
            <p className="t-lead">
              Tap an event to open it in your league. Brackets open once the
              draw is published.
            </p>
          </div>
          <div className="page-actions">
            {user ? (
              <Link
                href="/leagues"
                className="act act--prominent act--prominent-size"
              >
                My leagues
              </Link>
            ) : (
              <Link
                href="/sign-in?next=%2Fleagues%2Fnew"
                className="act act--prominent act--prominent-size"
              >
                Start a league
              </Link>
            )}
            <Link href="/" className="act act--quiet">
              MatchRead
            </Link>
          </div>
        </header>

        {(tournaments ?? []).length === 0 ? (
          <p className="stub-note">
            No tournaments yet. Apply{" "}
            <code>supabase/migrations/0003_brackets.sql</code>.
          </p>
        ) : (
          <ul className="calendar focus-band">
            {(tournaments ?? []).map((t) => {
              const href = hrefForTournament(
                t.name,
                t.ref,
                Boolean(user),
                leagues
              );
              const hasDraw = publishedIds.has(t.id);
              return (
                <li key={t.ref}>
                  <Link href={href} className="trow">
                    <span
                      className={`court-hairline court-${surfaceClass(t.surface)}`}
                      aria-hidden
                    />
                    <span className="trow-name">{t.name}</span>
                    <span className="trow-meta">
                      {t.surface}
                      {t.starts_on ? ` · ${t.starts_on}` : ""}
                      {" · "}
                      {hasDraw ? "draw open" : "draw pending"}
                    </span>
                    <span className="league-card-status">Open</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
