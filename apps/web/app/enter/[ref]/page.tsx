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

  if (error) {
    redirect(
      `/tournaments?error=${encodeURIComponent(
        error.message || "Could not start your bracket."
      )}`
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  const slug =
    row && typeof row === "object"
      ? ((row as { slug?: string; league_slug?: string }).slug ??
        (row as { league_slug?: string }).league_slug ??
        null)
      : null;

  if (!slug) {
    redirect(
      `/tournaments?error=${encodeURIComponent("Could not start your bracket.")}`
    );
  }

  redirect(`/leagues/${slug}/t/${event.ref}/bracket`);
}
