"use server";

/**
 * Founder tools that touch official match rows.
 *
 * The commissioner Settle button and Official Results panel were removed
 * (fix list P0-3, P0-4): they wrote brackets / matches with the viewer's
 * client, which RLS blocks, so they either changed nothing while reporting
 * success or always failed. Grading and results come only from the Edge
 * pipeline (settle-leagues, sync-facts), which runs as the service role.
 */

import { isFounderEmail } from "@/lib/auth/founder";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; graded: number }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Operator void / withdrawal path.
 * Marks matches.voided from fromRound onward when the player is on the path.
 */
export async function stubVoidPlayer(input: {
  tournamentId: string;
  playerId: string;
  fromRound?: number;
  reason?: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Sign in required." };

  if (!isFounderEmail(user.email ?? undefined)) {
    return { ok: false, error: "Founder access required." };
  }

  const raw = input.playerId.trim();
  if (!raw) return { ok: false, error: "player_id is required." };

  let playerId = raw;
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      raw
    );
  if (!uuidLike) {
    const { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("provider_id", raw)
      .maybeSingle();
    if (!player?.id) {
      return { ok: false, error: "Player not found (id or provider_id)." };
    }
    playerId = player.id;
  }

  const fromRound = input.fromRound ?? 0;

  const { data: results, error: resultsError } = await supabase
    .from("matches")
    .select(
      "id, round, index_in_round, winner_player_id, voided, side_a_player_id, side_b_player_id"
    )
    .eq("tournament_id", input.tournamentId);

  if (resultsError) {
    return { ok: false, error: resultsError.message };
  }

  let voidedMatches = 0;
  for (const row of results ?? []) {
    if (row.round < fromRound) continue;
    if (row.voided) continue;
    const undecided = !row.winner_player_id;
    const onPlayerPath = row.winner_player_id === playerId;
    const onSide =
      row.side_a_player_id === playerId || row.side_b_player_id === playerId;
    if (!undecided && !onPlayerPath) continue;
    if (undecided && !onSide && !onPlayerPath) continue;

    const { error: updError } = await supabase
      .from("matches")
      .update({
        voided: true,
        winner_player_id: null,
        settled_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updError) {
      return {
        ok: false,
        error: `${updError.message} (matches update blocked — service role / ingest required.)`,
      };
    }
    voidedMatches++;
  }

  return { ok: true, graded: voidedMatches };
}
