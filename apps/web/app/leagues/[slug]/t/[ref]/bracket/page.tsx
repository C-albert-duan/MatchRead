import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type {
  BracketConfidence,
  BracketPicks,
  DrawSeat,
  OfficialResults,
} from "@matchread/core";
import { AppShell } from "@/components/shell/AppShell";
import { BracketEditor } from "@/components/bracket/BracketEditor";
import { getSessionUser } from "@/lib/auth";
import { isTournamentLocked } from "@/lib/brackets/types";
import { t, tf } from "@/lib/i18n";
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

  const [{ data: seatRows }, { data: bracket }, { data: resultRows }] =
    await Promise.all([
      supabase
        .from("draw_seats")
        .select(
          "position, player_ref, last_name, seed, country_code, is_bye"
        )
        .eq("draw_id", draw.id)
        .order("position", { ascending: true }),
      supabase
        .from("brackets")
        .select("picks, confidence, submitted_at")
        .eq("league_id", league.id)
        .eq("tournament_id", tournament.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("match_results")
        .select("match_key, winner_ref, voided")
        .eq("tournament_id", tournament.id),
    ]);

  const seats = (seatRows ?? []) as DrawSeat[];
  const picks = (bracket?.picks ?? {}) as BracketPicks;
  const confidence = (bracket?.confidence ?? {}) as BracketConfidence;
  const locked = isTournamentLocked(tournament);

  const officialResults: OfficialResults = {};
  for (const row of resultRows ?? []) {
    officialResults[row.match_key] = {
      winnerRef: row.winner_ref,
      voided: row.voided,
    };
  }
  const hasOfficial = Object.keys(officialResults).length > 0;

  return (
    <AppShell signedIn email={user.email}>
      <div className="page">
        <header className="page-header page-header--split">
          <div className="page-header-copy">
            <p className="eyebrow">{league.name}</p>
            <h1 className="t-page-title">
              {tf("bracket.page.title", { name: tournament.name })}
            </h1>
            <p className="t-lead">
              {locked && hasOfficial
                ? t("bracket.page.lockedLede")
                : locked
                  ? t("bracket.page.lockedReadOnly")
                  : t("bracket.page.editLede")}
            </p>
          </div>
          <div className="page-actions">
            <Link
              href={`/leagues/${league.slug}/t/${tournament.ref}`}
              className="act act--standard act--standard-size"
            >
              {t("common.tournament")}
            </Link>
            <Link href={`/leagues/${league.slug}`} className="act act--quiet">
              {t("common.leagueHome")}
            </Link>
          </div>
        </header>

        <div className="focus-band">
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
            officialResults={officialResults}
          />
        </div>
      </div>
    </AppShell>
  );
}
