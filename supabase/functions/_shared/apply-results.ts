// supabase/functions/_shared/apply-results.ts
// Apply official match results into matches (used by sync-facts).
// Advances winners into parent match sides (idempotent).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parseMatchKey } from "./core.js";
import { advanceWinnerToParent } from "./rapidapi.js";

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
  advanced: number;
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
  log: string[] = [],
  opts: { runId?: string | null } = {}
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
  let advanced = 0;
  const skipped: { reason: string; id?: string }[] = [];
  const runId = opts.runId ?? null;

  // Round-ordered: settle lower rounds first so parent sides exist.
  const ordered = [...results].sort((a, b) => {
    const ka = a.match_key || "";
    const kb = b.match_key || "";
    const pa = parseMatchKey(ka);
    const pb = parseMatchKey(kb);
    if (pa && pb) {
      if (pa.round !== pb.round) return pa.round - pb.round;
      return pa.indexInRound - pb.indexInRound;
    }
    return ka.localeCompare(kb);
  });

  for (const r of ordered) {
    const match = await findMatch(admin, id, r);
    if (!match) {
      skipped.push({
        reason: "match not found",
        id: r.match_id || r.provider_match_id || r.match_key,
      });
      continue;
    }

    const before = {
      winner_player_id: match.winner_player_id,
      voided: match.voided,
      side_a_player_id: match.side_a_player_id,
      side_b_player_id: match.side_b_player_id,
    };

    const voided = Boolean(r.voided);
    let winnerId: string | null = null;

    // Settled + different winner → conflict (never overwrite).
    if (
      match.settled_at &&
      match.winner_player_id &&
      !voided
    ) {
      // Resolve candidate winner early for conflict check when already settled.
      let candidate: string | null = r.winner_player_id ?? null;
      if (!candidate) {
        const providerId =
          (r.winner_provider_id && String(r.winner_provider_id).trim()) ||
          extractProviderId(r.winner_ref);
        if (providerId) {
          candidate = await resolvePlayerId(admin, providerId, playerCache);
        }
      }
      if (candidate && candidate !== match.winner_player_id) {
        skipped.push({ reason: "winner conflict", id: match.id });
        if (runId) {
          await admin.from("ops_events").insert({
            kind: "reconcile",
            name: "winner_conflict",
            payload: {
              tournament_id: id,
              match_id: match.id,
              match_key: r.match_key,
              existing: match.winner_player_id,
              incoming: candidate,
            },
          });
        }
        continue;
      }
    }

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
          if (runId) {
            await admin.from("ops_events").insert({
              kind: "reconcile",
              name: "terminal_without_winner",
              payload: {
                tournament_id: id,
                match_key: r.match_key,
                match_id: match.id,
              },
            });
          }
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

    if (r.provider_match_id && !match.provider_match_id) {
      patch.provider_match_id = String(r.provider_match_id);
    }

    const unchanged =
      before.winner_player_id === (patch.winner_player_id ?? null) &&
      Boolean(before.voided) === voided;
    if (unchanged && !patch.side_a_player_id && !patch.side_b_player_id) {
      skipped.push({ reason: "already settled", id: match.id });
      continue;
    }

    const claimOutcome = voided ? "void" : "winner";
    const { data: claimStatus, error: claimErr } = await admin.rpc(
      "claim_settlement",
      {
        p_match: match.id,
        p_outcome: claimOutcome,
        p_winner: voided ? null : winnerId,
        p_run: runId,
      }
    );
    if (claimErr) {
      // Migration not applied yet — fall through without claim guard.
      if (!/claim_settlement|function .* does not exist/i.test(claimErr.message)) {
        log.push(`claim_settlement failed: ${claimErr.message}`);
        skipped.push({ reason: `claim: ${claimErr.message}`, id: match.id });
        continue;
      }
    } else if (claimStatus === "noop") {
      skipped.push({ reason: "claim noop", id: match.id });
      continue;
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

    if (runId) {
      await admin.from("sync_repairs").insert({
        run_id: runId,
        tournament_id: id,
        match_key: r.match_key || matchKeyOf(match),
        provider_match_id: r.provider_match_id
          ? String(r.provider_match_id)
          : match.provider_match_id,
        before,
        after: { ...patch, claim: claimStatus ?? "legacy" },
        note: voided ? "voided" : "winner",
      });
    }

    if (!voided && winnerId) {
      const did = await writeWinnerIntoParent(
        admin,
        id,
        match.round,
        match.index_in_round,
        winnerId,
        now
      );
      if (did) advanced += 1;
    }
  }

  log.push(
    `applied ${updated} results, advanced ${advanced}, skipped ${skipped.length}`
  );
  return { ok: true, updated, advanced, skipped, log };
}

function matchKeyOf(match: {
  round: number;
  index_in_round: number;
}): string {
  return `r${match.round}-m${match.index_in_round}`;
}

async function writeWinnerIntoParent(
  admin: SupabaseClient,
  tournamentId: string,
  round: number,
  indexInRound: number,
  winnerId: string,
  now: string
): Promise<boolean> {
  const parent = advanceWinnerToParent(round, indexInRound, winnerId);
  if (!parent) return false;

  const { data: parentRow, error } = await admin
    .from("matches")
    .select("id, side_a_player_id, side_b_player_id, winner_player_id")
    .eq("tournament_id", tournamentId)
    .eq("round", parent.round)
    .eq("index_in_round", parent.indexInRound)
    .maybeSingle();
  if (error || !parentRow) return false;

  const col = parent.sideColumn as "side_a_player_id" | "side_b_player_id";
  const current = parentRow[col];
  if (current === winnerId) return false;

  // Do not overwrite a different already-settled occupant unless empty.
  if (current && parentRow.winner_player_id) return false;

  const { error: upErr } = await admin
    .from("matches")
    .update({ [col]: winnerId })
    .eq("id", parentRow.id);
  if (upErr) return false;

  // Bye auto-settle if the other side is already a bye-settled winner path —
  // not applicable here; bye handling is at topology build.
  void now;
  return true;
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
  round: number;
  index_in_round: number;
  side_a_player_id: string | null;
  side_b_player_id: string | null;
  provider_match_id: string | null;
  winner_player_id: string | null;
  voided: boolean | null;
  settled_at: string | null;
} | null> {
  const cols =
    "id, round, index_in_round, side_a_player_id, side_b_player_id, provider_match_id, winner_player_id, voided, settled_at";
  if (r.match_id) {
    const { data } = await admin
      .from("matches")
      .select(cols)
      .eq("id", r.match_id)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    return data ?? null;
  }

  if (r.provider_match_id) {
    const { data } = await admin
      .from("matches")
      .select(cols)
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
      .select(cols)
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
