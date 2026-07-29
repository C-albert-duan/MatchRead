import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { BracketConfidence, BracketPicks, DrawSeat } from "@matchread/core";
import { AppShell } from "@/components/AppShell";
import { BracketEditor } from "@/components/BracketEditor";
import { getSessionUser } from "@/lib/auth";
import { isTournamentLocked } from "@/lib/brackets/types";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: { slug: string; ref: string };
};

export default async function BracketPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(
        `/leagues/${params.slug}/t/${params.ref}/bracket`
      )}`
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
    .select("id")
    .eq("tournament_id", tournament.id)
    .maybeSingle();

  if (!draw) {
    redirect(`/leagues/${league.slug}/t/${tournament.ref}`);
  }

  const { data: seatRows } = await supabase
    .from("draw_seats")
    .select(
      "position, player_ref, last_name, seed, country_code, is_bye"
    )
    .eq("draw_id", draw.id)
    .order("position", { ascending: true });

  const seats = (seatRows ?? []) as DrawSeat[];

  const { data: bracket } = await supabase
    .from("brackets")
    .select("picks, confidence, submitted_at")
    .eq("league_id", league.id)
    .eq("tournament_id", tournament.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const picks = (bracket?.picks ?? {}) as BracketPicks;
  const confidence = (bracket?.confidence ?? {}) as BracketConfidence;
  const locked = isTournamentLocked(tournament);

  return (
    <AppShell signedIn email={user.email}>
      <div className="stack gap-3xl">
        <div className="stack gap-lg">
          <p className="eyebrow">{league.name}</p>
          <h1 className="t-page-title">{tournament.name} bracket</h1>
          <p className="t-lead">
            {locked
              ? "Locked — picks are read-only."
              : "Pick a winner in each match. Changes save automatically."}
          </p>
          <div className="row wrap gap-md">
            <Link
              href={`/leagues/${league.slug}/t/${tournament.ref}`}
              className="act act--standard act--standard-size"
            >
              Tournament
            </Link>
            <Link
              href={`/leagues/${league.slug}`}
              className="act act--standard act--standard-size"
            >
              League home
            </Link>
          </div>
        </div>

        <BracketEditor
          leagueId={league.id}
          leagueSlug={league.slug}
          tournamentId={tournament.id}
          tournamentRef={tournament.ref}
          drawSize={tournament.draw_size}
          seats={seats}
          initialPicks={picks}
          initialConfidence={confidence}
          submittedAt={bracket?.submitted_at ?? null}
          locked={locked}
          isCommissioner={membership.role === "commissioner"}
        />
      </div>
    </AppShell>
  );
}
