import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { DailyCheckPanel } from "@/components/league/DailyCheckPanel";
import { EngagementStrip } from "@/components/league/EngagementStrip";
import { InvitePanel } from "@/components/league/InvitePanel";
import { LeagueHighlights } from "@/components/league/LeagueHighlights";
import { getSessionUser } from "@/lib/auth";
import { getServerSiteUrl } from "@/lib/env";
import { t, tf } from "@/lib/i18n";
import { loadDailyCheck } from "@/lib/leagues/daily-check";
import { loadDisplayNames, memberLabel } from "@/lib/profiles/labels";
import { redirectIfMissingDisplayName } from "@/lib/profiles/require-name";
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

/** Badge on league home tournament list — not just “does a draw exist?”. */
function tournamentListStatus(input: {
  hasDraw: boolean;
  drawSize: number;
  decidedCount: number;
  settled: boolean;
}): string {
  if (!input.hasDraw) return t("league.status.drawPending");
  const expected = Math.max(input.drawSize - 1, 0);
  if (expected > 0 && input.decidedCount >= expected) {
    return input.settled ? t("league.status.settled") : t("league.status.complete");
  }
  if (input.decidedCount > 0) return t("league.status.live");
  return t("league.status.drawOpen");
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

  await redirectIfMissingDisplayName(
    supabase,
    user.id,
    `/leagues/${params.slug}`
  );

  const membership = membershipRes.data;
  const members = membersRes.data ?? [];
  const memberCount = members.length;
  const isCommissioner = membership.role === "commissioner";

  const memberNames = await loadDisplayNames(
    supabase,
    members.map((m) => m.user_id)
  );

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

  const tournamentIds = leagueTournaments.map((t) => t.id);
  const [{ data: resultRows }, { data: snapRows }] =
    tournamentIds.length > 0
      ? await Promise.all([
          supabase
            .from("match_results")
            .select("tournament_id, winner_ref, voided")
            .in("tournament_id", tournamentIds),
          supabase
            .from("bracket_snapshots")
            .select("tournament_id")
            .eq("league_id", league.id)
            .in("tournament_id", tournamentIds),
        ])
      : [
          { data: [] as Array<{ tournament_id: string; winner_ref: string | null; voided: boolean }> },
          { data: [] as Array<{ tournament_id: string }> },
        ];

  const decidedByTournament = new Map<string, number>();
  for (const row of resultRows ?? []) {
    if (row.voided || row.winner_ref) {
      decidedByTournament.set(
        row.tournament_id,
        (decidedByTournament.get(row.tournament_id) ?? 0) + 1
      );
    }
  }
  const settledTournaments = new Set(
    (snapRows ?? []).map((s) => s.tournament_id)
  );

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">{t("league.eyebrow")}</p>
            <h1 className="t-page-title">{league.name}</h1>
            <p className="t-lead">
              {league.format === "single"
                ? league.tournament_label ?? t("league.format.single")
                : t("league.format.season")}
              {" · "}
              {league.visibility}
              {" · "}
              {memberCount === 1
                ? tf("leagues.members.count.one", { n: memberCount })
                : tf("leagues.members.count", { n: memberCount })}
            </p>
          </div>
          <div className="page-actions">
            {tournament ? (
              <Link
                href={`/leagues/${league.slug}/t/${tournament.ref}`}
                className="act act--prominent act--prominent-size"
              >
                {tournament.has_draw
                  ? t("league.openTournament")
                  : t("league.drawPendingCta")}
              </Link>
            ) : null}
            <Link
              href={`/leagues/${league.slug}/season`}
              className="act act--standard act--standard-size"
            >
              {t("league.seasonStandings")}
            </Link>
            <Link href="/leagues" className="act act--quiet">
              {t("league.allLeagues")}
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
              {t("league.grow.title")}
            </h2>
            <p className="section-lede">{t("league.grow.lede")}</p>
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
            {t("league.tournaments")}
          </h2>
          {leagueTournaments.length === 0 ? (
            <p className="t-body">
              {t("league.noTournaments")} Apply{" "}
              <code>supabase/migrations/0003_brackets.sql</code>.
            </p>
          ) : (
            <ul className="league-list">
              {leagueTournaments.map((t) => {
                const hasDraw = publishedIds.has(t.id);
                const status = tournamentListStatus({
                  hasDraw,
                  drawSize: t.draw_size,
                  decidedCount: decidedByTournament.get(t.id) ?? 0,
                  settled: settledTournaments.has(t.id),
                });
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
                      <span className="league-card-status">{status}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="section" aria-labelledby="members-heading">
          <h2 id="members-heading" className="section-title">
            {t("league.members")}
          </h2>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.user_id} className="member-row">
                <span className="numeral">
                  {memberLabel(m.user_id, user.id, memberNames)}
                </span>
                <span className="t-caption">
                  {m.role === "commissioner"
                    ? t("league.role.commissioner")
                    : t("league.role.member")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
