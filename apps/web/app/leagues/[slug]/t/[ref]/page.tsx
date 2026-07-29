import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LiveRefresh } from "@/components/LiveRefresh";
import { SettleButton } from "@/components/SettleButton";
import { StandingsTable } from "@/components/StandingsTable";
import { getSessionUser } from "@/lib/auth";
import { isTournamentLocked } from "@/lib/brackets/types";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: { slug: string; ref: string };
};

export default async function TournamentInLeaguePage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/leagues/${params.slug}/t/${params.ref}`)}`
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

  const { data: draw } = await supabase
    .from("draws")
    .select("id, published_at")
    .eq("tournament_id", tournament.id)
    .maybeSingle();

  const { data: bracket } = await supabase
    .from("brackets")
    .select("submitted_at, updated_at")
    .eq("league_id", league.id)
    .eq("tournament_id", tournament.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: snapshots } = await supabase
    .from("bracket_snapshots")
    .select(
      "user_id, score, position, previous_position, position_delta, score_delta, upside, champion_alive"
    )
    .eq("league_id", league.id)
    .eq("tournament_id", tournament.id)
    .order("position", { ascending: true });

  const locked = isTournamentLocked(tournament);
  const hasDraw = Boolean(draw);
  const isCommissioner = membership.role === "commissioner";
  const bracketHref = `/leagues/${league.slug}/t/${tournament.ref}/bracket`;

  let bracketLabel = "Open my bracket";
  if (locked) bracketLabel = "View my bracket";
  else if (bracket?.submitted_at || bracket?.updated_at)
    bracketLabel = "Review my bracket";

  const standingRows = (snapshots ?? []).map((s) => ({
    user_id: s.user_id,
    score: s.score,
    position: s.position,
    previous_position: s.previous_position,
    score_delta: s.score_delta,
    position_delta: s.position_delta,
    upside: s.upside,
    champion_alive: s.champion_alive,
    label: s.user_id === user.id ? "You" : `${s.user_id.slice(0, 8)}…`,
    isYou: s.user_id === user.id,
  }));

  return (
    <AppShell signedIn email={user.email}>
      <LiveRefresh enabled={hasDraw} />
      <div className="stack gap-4xl">
        <div className="stack gap-lg">
          <p className="eyebrow">{league.name}</p>
          <h1 className="t-page-title">{tournament.name}</h1>
          <p className="t-lead">
            {tournament.surface} court
            {tournament.starts_on ? ` · starts ${tournament.starts_on}` : ""}
            {tournament.lock_at
              ? ` · locks ${new Date(tournament.lock_at).toUTCString()}`
              : ""}
            {locked ? " · locked" : ""}
          </p>
          <div className="row wrap gap-md">
            <Link
              href={`/leagues/${league.slug}`}
              className="act act--standard act--standard-size"
            >
              League home
            </Link>
            <Link
              href={`/leagues/${league.slug}/season`}
              className="act act--standard act--standard-size"
            >
              Season standings
            </Link>
            {hasDraw ? (
              <Link
                href={bracketHref}
                className="act act--prominent act--standard-size"
              >
                {bracketLabel}
              </Link>
            ) : null}
          </div>
        </div>

        {!hasDraw ? (
          <section className="panel stack gap-md" aria-labelledby="draw-pending">
            <h2 id="draw-pending" className="section-title">
              Draw pending
            </h2>
            <p className="t-body">
              The draw has not been published yet. Your league is waiting, not
              finished — invite friends and come back when the bracket opens.
            </p>
          </section>
        ) : (
          <section className="stack gap-md">
            <h2 className="section-title">Your entry</h2>
            <p className="t-body">
              {locked
                ? "The draw is locked. You can view your picks; they can no longer be changed."
                : bracket?.submitted_at
                  ? "Your bracket is submitted for this league. You can still edit until the lock."
                  : "Fill the tree, save as you go, then submit when every match has a pick."}
            </p>
            <Link
              href={bracketHref}
              className="act act--prominent act--standard-size"
            >
              {bracketLabel}
            </Link>
          </section>
        )}

        {hasDraw ? (
          <section className="stack gap-lg" aria-labelledby="event-standings">
            <h2 id="event-standings" className="section-title">
              Event standings
            </h2>
            <StandingsTable rows={standingRows} kind="event" />
            {standingRows.length > 0 ? (
              <Link
                href={`/leagues/${league.slug}/t/${tournament.ref}/result`}
                className="act act--standard act--standard-size"
              >
                See my result
              </Link>
            ) : null}
            {isCommissioner ? (
              <SettleButton
                leagueId={league.id}
                leagueSlug={league.slug}
                tournamentId={tournament.id}
                tournamentRef={tournament.ref}
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
