import { rpcErrorCode } from "@/lib/actions/errors";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  enterHref,
  getCalendarTournament,
  isEntryOpen,
  tournamentHref,
} from "@/lib/tournaments/calendar";

type Props = {
  params: { ref: string };
};

/**
 * Bracket-first entry: ensure a personal solo league for this tournament
 * and redirect to the bracket editor.
 */
export default async function EnterTournamentPage({ params }: Props) {
  const ref = decodeURIComponent(params.ref).trim();
  const next = enterHref(ref);

  const user = await getSessionUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  if (!ref) {
    redirect("/tournaments");
  }

  const event = await getCalendarTournament(ref);
  if (!event || !isEntryOpen(event)) {
    redirect(event ? tournamentHref(event.ref) : "/tournaments");
  }

  const supabase = createClient();
  await supabase.rpc("ensure_profile");

  const { data, error } = await supabase.rpc("ensure_solo_league", {
    p_tournament_id: event.id,
  });

  // Only a code crosses the URL; the page owns the copy (fix list P2-11).
  if (error) {
    redirect(`/tournaments?error=${rpcErrorCode(error, "bracket_start_failed")}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const slug =
    row && typeof row === "object"
      ? ((row as { slug?: string; league_slug?: string }).slug ??
        (row as { league_slug?: string }).league_slug ??
        null)
      : null;

  if (!slug) {
    redirect("/tournaments?error=bracket_start_failed");
  }

  redirect(`/leagues/${slug}/t/${event.ref}/bracket`);
}
