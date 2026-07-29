import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DailyCheckPanel } from "@/components/DailyCheckPanel";
import { EngagementStrip } from "@/components/EngagementStrip";
import { InvitePanel } from "@/components/InvitePanel";
import { LeagueHighlights } from "@/components/LeagueHighlights";
import { getSessionUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { loadDailyCheck } from "@/lib/leagues/daily-check";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: { slug: string };
  searchParams: { invite?: string };
};

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

  const { data: membership } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    notFound();
  }

  const { count: memberCount } = await supabase
    .from("league_members")
    .select("*", { count: "exact", head: true })
    .eq("league_id", league.id);

  const { data: members } = await supabase
    .from("league_members")
    .select("user_id, role, joined_at")
    .eq("league_id", league.id)
    .order("joined_at", { ascending: true });

  let inviteUrl: string | null = null;
  const isCommissioner = membership.role === "commissioner";

  if (isCommissioner) {
    const { data: invite } = await supabase
      .from("league_invites")
      .select("token")
      .eq("league_id", league.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invite?.token) {
      inviteUrl = `${siteUrl()}/join/${invite.token}`;
    }
  }

  const openInvite = searchParams.invite === "1" && Boolean(inviteUrl);

  let tournament:
    | {
        ref: string;
        name: string;
        has_draw: boolean;
      }
    | null = null;

  if (league.tournament_label) {
    const { data: t } = await supabase
      .from("tournaments")
      .select("id, ref, name")
      .eq("name", league.tournament_label)
      .maybeSingle();

    if (t) {
      const { data: draw } = await supabase
        .from("draws")
        .select("id")
        .eq("tournament_id", t.id)
        .maybeSingle();
      tournament = {
        ref: t.ref,
        name: t.name,
        has_draw: Boolean(draw),
      };
    }
  }

  const { check, engagement } = await loadDailyCheck({
    supabase,
    league,
    userId: user.id,
    memberCount: memberCount ?? 0,
  });

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-4xl">
        <div className="stack gap-lg">
          <p className="eyebrow">League</p>
          <h1 className="t-page-title">{league.name}</h1>
          <p className="t-lead">
            {league.format === "single"
              ? league.tournament_label ?? "Single tournament"
              : "Season league"}
            {" · "}
            {league.visibility}
            {" · "}
            {memberCount ?? 0}{" "}
            {(memberCount ?? 0) === 1 ? "member" : "members"}
          </p>
          <div className="row wrap gap-md">
            <Link href="/leagues" className="act act--standard act--standard-size">
              All leagues
            </Link>
            <Link
              href={`/leagues/${league.slug}/season`}
              className="act act--standard act--standard-size"
            >
              Season standings
            </Link>
            {tournament ? (
              <Link
                href={`/leagues/${league.slug}/t/${tournament.ref}`}
                className="act act--prominent act--standard-size"
              >
                {tournament.has_draw
                  ? "Open tournament"
                  : "Tournament (draw pending)"}
              </Link>
            ) : null}
          </div>
        </div>

        <DailyCheckPanel check={check} />

        {engagement ? (
          <EngagementStrip
            health={engagement.health}
            perfectRemaining={engagement.perfectRemaining}
            perfectLeagueCount={engagement.perfectLeagueCount}
          />
        ) : null}

        {engagement && engagement.highlights.length > 0 ? (
          <LeagueHighlights
            items={engagement.highlights.map((h) => ({
              label: h.label,
              memberLabel: h.memberLabel,
              isYou: h.isYou,
            }))}
          />
        ) : null}

        {isCommissioner && inviteUrl ? (
          <InvitePanel
            leagueId={league.id}
            slug={league.slug}
            inviteUrl={inviteUrl}
            defaultOpen={openInvite}
          />
        ) : null}

        <section className="section" aria-labelledby="members-heading">
          <h2 id="members-heading" className="section-title">
            Members
          </h2>
          <ul className="member-list">
            {(members ?? []).map((m) => (
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
