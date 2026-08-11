import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listCalendarTournaments } from "@/lib/tournaments/calendar";

type Props = {
  params: { ref: string };
};

/**
 * Bracket-first entry: ensure a personal solo league for this tournament
 * and redirect to the bracket editor.
 */
export default async function EnterTournamentPage({ params }: Props) {
  const ref = decodeURIComponent(params.ref).trim();
  const next = `/enter/${encodeURIComponent(ref)}`;

  const user = await getSessionUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  if (!ref) {
    redirect("/tournaments");
  }

  const calendar = await listCalendarTournaments();
  const event = calendar.find((row) => row.ref === ref);
  if (!event?.hasDraw) {
    redirect(
      `/tournaments?error=${encodeURIComponent(
        "Draw pending — entry opens when the official draw is verified."
      )}`
    );
  }

  const supabase = createClient();
  await supabase.rpc("ensure_profile");

  const { data, error } = await supabase.rpc("ensure_solo_league", {
    p_tournament_ref: ref,
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
      ? ((row as { league_slug?: string }).league_slug ?? null)
      : null;
  const outRef =
    row && typeof row === "object"
      ? ((row as { tournament_ref?: string }).tournament_ref ?? ref)
      : ref;

  if (!slug) {
    redirect(
      `/tournaments?error=${encodeURIComponent("Could not start your bracket.")}`
    );
  }

  redirect(`/leagues/${slug}/t/${outRef}/bracket`);
}
