import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { DailyCheckPanel } from "@/components/league/DailyCheckPanel";
import { EngagementStrip } from "@/components/league/EngagementStrip";
import { InvitePanel } from "@/components/league/InvitePanel";
import { LeagueHighlights } from "@/components/league/LeagueHighlights";
import { getSessionUser } from "@/lib/auth";
import { getServerSiteUrl } from "@/lib/env";
import { loadDailyCheck } from "@/lib/leagues/daily-check";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: { slug: string };
  searchParams: { invite?: string };
};

function surfaceClass(surface: string | null | undefined) {
  const s = (surface ?? "").toLowerCase();
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  return "hard";
}

export default async function LeagueHomePage({ params, searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/leagues/${params.slug}`)}`);
  }

  const supabase = createClient();
  const { data: league, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  if (error || !league) {
    notFound();
  }

  const [membershipRes, membersRes] = await Promise.all([
    supabase
      .from("league_members")
      .select("role")
      .eq("league_id", league.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("league_members")
      .select("user_id, role, joined_at")
      .eq("league_id", league.id)
      .order("joined_at", { ascending: true }),
  ]);

  if (!membershipRes.data) {
    notFound();
  }

  const membership = membershipRes.data;
  const members = membersRes.data ?? [];
  const memberCount = members.length;
  const isCommissioner = membership.role === "commissioner";

  const [bundle, inviteRes, tournamentsRes, drawsRes] = await Promise.all([
    loadDailyCheck({
      supabase,
      league,
      userId: user.id,
      memberCount,
    }),
    isCommissioner
      ? supabase
          .from("league_invites")
          .select("token")
          .eq("league_id", league.id)
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as { token: string } | null }),
    supabase
      .from("tournaments")
      .select("id, ref, name, surface, starts_on, draw_size")
      .order("starts_on", { ascending: true }),
    supabase.from("draws").select("tournament_id"),
  ]);

  const { check, engagement, tournament } = bundle;

  let inviteUrl: string | null = null;
  if (inviteRes.data?.token) {
    inviteUrl = `${getServerSiteUrl()}/join/${inviteRes.data.token}`;
  }

  const openInvite = searchParams.invite === "1" && Boolean(inviteUrl);

  const publishedIds = new Set(
    (drawsRes.data ?? []).map((d) => d.tournament_id)
  );

  const leagueTournaments = (tournamentsRes.data ?? []).filter((t) => {
    if (league.format === "single" && league.tournament_label) {
      return t.name === league.tournament_label;
    }
    return league.format === "season";
  });

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">League</p>
            <h1 className="t-page-title">{league.name}</h1>
            <p className="t-lead">
              {league.format === "single"
                ? league.tournament_label ?? "Single tournament"
                : "Season league"}
              {" · "}
              {league.visibility}
              {" · "}
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          <div className="page-actions">
            {tournament ? (
              <Link
                href={`/leagues/${league.slug}/t/${tournament.ref}`}
                className="act act--prominent act--prominent-size"
              >
                {tournament.has_draw
                  ? "Open tournament"
                  : "Tournament (draw pending)"}
              </Link>
            ) : null}
            <Link
              href={`/leagues/${league.slug}/season`}
              className="act act--standard act--standard-size"
            >
              Season standings
            </Link>
            <Link href="/leagues" className="act act--quiet">
              All leagues
            </Link>
          </div>
        </header>

        <DailyCheckPanel check={check} />

        {engagement ? (
          <section className="section" aria-label="Engagement">
            <EngagementStrip
              health={engagement.health}
              perfectRemaining={engagement.perfectRemaining}
              perfectLeagueCount={engagement.perfectLeagueCount}
            />
          </section>
        ) : null}

        {engagement && engagement.highlights.length > 0 ? (
          <section className="section" aria-label="Highlights">
            <LeagueHighlights
              items={engagement.highlights.map((h) => ({
                label: h.label,
                memberLabel: h.memberLabel,
                isYou: h.isYou,
              }))}
            />
          </section>
        ) : null}

        {isCommissioner && inviteUrl ? (
          <section className="section" aria-labelledby="invite-heading">
            <h2 id="invite-heading" className="section-title">
              Grow the league
            </h2>
            <p className="section-lede">
              Share one link. Friends join, fill brackets, and the Daily Check
              gets interesting.
            </p>
            <InvitePanel
              leagueId={league.id}
              slug={league.slug}
              inviteUrl={inviteUrl}
              defaultOpen={openInvite}
            />
          </section>
        ) : null}

        <section className="section" aria-labelledby="tournaments-heading">
          <h2 id="tournaments-heading" className="section-title">
            Tournaments
          </h2>
          {leagueTournaments.length === 0 ? (
            <p className="t-body">
              No tournaments in the calendar yet. Apply{" "}
              <code>supabase/migrations/0003_brackets.sql</code>.
            </p>
          ) : (
            <ul className="league-list">
              {leagueTournaments.map((t) => {
                const hasDraw = publishedIds.has(t.id);
                return (
                  <li key={t.id}>
                    <Link
                      href={`/leagues/${league.slug}/t/${t.ref}`}
                      className="league-card"
                    >
                      <span
                        className={`court-hairline court-${surfaceClass(t.surface)}`}
                        aria-hidden
                      />
                      <span
                        className="stack gap-sm"
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <span className="league-card-name">{t.name}</span>
                        <span className="t-caption">
                          {t.surface}
                          {t.starts_on ? ` · ${t.starts_on}` : ""}
                          {" · "}
                          {t.draw_size}-draw
                        </span>
                      </span>
                      <span className="league-card-status">
                        {hasDraw ? "Draw open" : "Draw pending"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="section" aria-labelledby="members-heading">
          <h2 id="members-heading" className="section-title">
            Members
          </h2>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.user_id} className="member-row">
                <span className="numeral">
                  {m.user_id === user.id
                    ? "You"
                    : `${m.user_id.slice(0, 8)}…`}
                </span>
                <span className="t-caption">
                  {m.role === "commissioner" ? "Commissioner" : "Member"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
