// supabase/functions/_shared/apply-results.ts
// Apply official match results into matches (used by sync-facts).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parseMatchKey } from "./core.js";

export type MatchResultIn = {
  match_id?: string;
  provider_match_id?: string;
  match_key?: string;
  winner_player_id?: string | null;
  winner_provider_id?: string | null;
  winner_ref?: string | null;
  voided?: boolean;
};

export type ApplyMatchResultsOk = {
  ok: true;
  updated: number;
  skipped: { reason: string; id?: string }[];
  log: string[];
};

export type ApplyMatchResultsResult =
  | ApplyMatchResultsOk
  | { ok: false; error: string; log: string[] };

export async function applyMatchResults(
  admin: SupabaseClient,
  tournamentId: string,
  results: MatchResultIn[],
  log: string[] = []
): Promise<ApplyMatchResultsResult> {
  const id = tournamentId?.trim();
  if (!id || results.length === 0) {
    return {
      ok: false,
      error: "tournament_id and results[] required",
      log,
    };
  }

  const now = new Date().toISOString();
  const playerCache = new Map<string, string>();
  let updated = 0;
  const skipped: { reason: string; id?: string }[] = [];

  for (const r of results) {
    const match = await findMatch(admin, id, r);
    if (!match) {
      skipped.push({
        reason: "match not found",
        id: r.match_id || r.provider_match_id || r.match_key,
      });
      continue;
    }

    const voided = Boolean(r.voided);
    let winnerId: string | null = null;

    if (!voided) {
      if (r.winner_player_id) {
        winnerId = r.winner_player_id;
      } else {
        const providerId =
          (r.winner_provider_id && String(r.winner_provider_id).trim()) ||
          extractProviderId(r.winner_ref);
        if (!providerId) {
          skipped.push({
            reason: "no winner id",
            id: match.id,
          });
          continue;
        }
        winnerId = await resolvePlayerId(admin, providerId, playerCache);
        if (!winnerId) {
          skipped.push({
            reason: `unknown winner provider ${providerId}`,
            id: match.id,
          });
          continue;
        }
      }
    }

    const patch: Record<string, unknown> = {
      voided,
      winner_player_id: voided ? null : winnerId,
      settled_at: now,
    };

    if (
      winnerId &&
      match.side_a_player_id !== winnerId &&
      match.side_b_player_id !== winnerId
    ) {
      if (!match.side_a_player_id) patch.side_a_player_id = winnerId;
      else if (!match.side_b_player_id) patch.side_b_player_id = winnerId;
      else {
        skipped.push({
          reason: "winner not on either side",
          id: match.id,
        });
        continue;
      }
    }

    const { error } = await admin
      .from("matches")
      .update(patch)
      .eq("id", match.id);
    if (error) {
      log.push(`results update failed: ${error.message}`);
      return { ok: false, error: error.message, log };
    }
    updated += 1;
  }

  log.push(`applied ${updated} results, skipped ${skipped.length}`);
  return { ok: true, updated, skipped, log };
}

async function findMatch(
  admin: SupabaseClient,
  tournamentId: string,
  r: {
    match_id?: string;
    provider_match_id?: string;
    match_key?: string;
  }
): Promise<{
  id: string;
  side_a_player_id: string | null;
  side_b_player_id: string | null;
} | null> {
  if (r.match_id) {
    const { data } = await admin
      .from("matches")
      .select("id, side_a_player_id, side_b_player_id")
      .eq("id", r.match_id)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    return data ?? null;
  }

  if (r.provider_match_id) {
    const { data } = await admin
      .from("matches")
      .select("id, side_a_player_id, side_b_player_id")
      .eq("tournament_id", tournamentId)
      .eq("provider_match_id", String(r.provider_match_id))
      .maybeSingle();
    return data ?? null;
  }

  if (r.match_key) {
    const parsed = parseMatchKey(r.match_key);
    if (!parsed) return null;
    const { data } = await admin
      .from("matches")
      .select("id, side_a_player_id, side_b_player_id")
      .eq("tournament_id", tournamentId)
      .eq("round", parsed.round)
      .eq("index_in_round", parsed.indexInRound)
      .maybeSingle();
    return data ?? null;
  }

  return null;
}

async function resolvePlayerId(
  admin: SupabaseClient,
  providerId: string,
  cache: Map<string, string>
): Promise<string | null> {
  if (cache.has(providerId)) return cache.get(providerId)!;
  const { data } = await admin
    .from("players")
    .select("id")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (!data?.id) return null;
  cache.set(providerId, data.id);
  return data.id;
}

function extractProviderId(ref: string | null | undefined): string | null {
  const s = String(ref || "").trim();
  if (!s) return null;
  const m = s.match(/^(?:atp|wta)-(.+)$/i);
  if (m) return m[1];
  return s;
}
