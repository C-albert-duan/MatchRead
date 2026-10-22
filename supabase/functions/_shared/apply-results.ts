// supabase/functions/_shared/apply-results.ts
// Apply official match results into matches (used by sync-facts).
// Advances winners into parent match sides (idempotent).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { clearProvisionalLive } from "./clear-live.ts";
import { parseMatchKey } from "./core.js";
import {
  advanceWinnerToParent,
  clearsProvisionalLive,
  matchLookupFromQuery,
  mergeSettledFact,
  planProviderMatchRelocation,
  settledFactSkipReason,
} from "./rapidapi.js";

/**
 * Move one emitted provider_match_id onto its bound match.
 * Clears that id from every other match in the tournament first.
 * The release writes provider_match_id only.
 * No binding is a no-op: nothing is released.
 */
export async function relocateProviderMatchId(
  admin: SupabaseClient,
  tournamentId: string,
  binding: { match_key?: string; provider_match_id?: string } | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = tournamentId?.trim();
  const pmid = String(binding?.provider_match_id || "").trim();
  const key = String(binding?.match_key || "").trim();
  if (!binding || !id || !pmid || !key) return { ok: true };

  const { data: holders, error: readErr } = await admin
    .from("matches")
    .select("round, index_in_round, provider_match_id")
    .eq("tournament_id", id)
    .eq("provider_match_id", pmid);
  if (readErr) return { ok: false, error: readErr.message };

  const matchSides = (holders ?? []).map((row) => ({
    match_key: `r${row.round}-m${row.index_in_round}`,
    provider_match_id:
      row.provider_match_id == null ? null : String(row.provider_match_id),
  }));
  if (!matchSides.some((row) => row.match_key === key)) {
    matchSides.push({ match_key: key, provider_match_id: null });
  }

  const plan = planProviderMatchRelocation(
    { match_key: key, provider_match_id: pmid },
    matchSides
  );
  if (!plan.assign) return { ok: true };

  for (const rel of plan.releases) {
    const parsed = parseMatchKey(rel.match_key);
    if (!parsed) continue;
    const { error } = await admin
      .from("matches")
      .update(rel.patch)
      .eq("tournament_id", id)
      .eq("round", parsed.round)
      .eq("index_in_round", parsed.indexInRound);
    if (error) return { ok: false, error: error.message };
  }

  const parsed = parseMatchKey(plan.assign.match_key);
  if (!parsed) return { ok: false, error: "bad match key" };
  const { error } = await admin
    .from("matches")
    .update(plan.assign.patch)
    .eq("tournament_id", id)
    .eq("round", parsed.round)
    .eq("index_in_round", parsed.indexInRound);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type MatchResultIn = {
  match_id?: string;
  provider_match_id?: string;
  match_key?: string;
  winner_player_id?: string | null;
  winner_provider_id?: string | null;
  winner_ref?: string | null;
  voided?: boolean;
  official_score?: string | null;
  fact_kind?: "played" | "withdrawal" | "void" | null;
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
  if (!id) {
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

  // Heal bye/prior settles that never wrote the winner into the parent side.
  advanced += await healSettledAdvances(admin, id);

  if (results.length === 0) {
    log.push(
      `applied 0 results, advanced ${advanced} (heal-only), skipped 0`
    );
    return { ok: true, updated: 0, advanced, skipped, log };
  }

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
    const found = await findMatch(admin, id, r);
    if (!found.ok) {
      log.push(`results lookup failed: ${found.error}`);
      return { ok: false, error: found.error, log };
    }
    const match = found.row;
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

    const decision = mergeSettledFact(
      {
        settled_at: match.settled_at,
        winner_player_id: match.winner_player_id,
        voided: match.voided,
        official_score: match.official_score,
        fact_kind: match.fact_kind,
      },
      {
        winner_player_id: winnerId,
        voided,
        official_score: r.official_score ?? null,
        fact_kind: r.fact_kind ?? null,
      }
    );

    if (decision.conflicts.includes("winner") && runId) {
        await admin.from("ops_events").insert({
          kind: "reconcile",
          name: "winner_conflict",
          payload: {
            tournament_id: id,
            match_id: match.id,
            match_key: r.match_key,
            existing: match.winner_player_id,
            incoming: winnerId,
            voided_existing: Boolean(match.voided),
            voided_incoming: voided,
          },
        });
    }
    if (decision.conflicts.includes("score") && runId) {
      await admin.from("ops_events").insert({
        kind: "reconcile",
        name: "score_conflict",
        payload: {
          tournament_id: id,
          match_id: match.id,
          match_key: r.match_key,
          existing: match.official_score,
          incoming: r.official_score ?? null,
        },
      });
    }
    if (decision.conflicts.includes("fact_kind") && runId) {
      await admin.from("ops_events").insert({
        kind: "reconcile",
        name: "fact_kind_conflict",
        payload: {
          tournament_id: id,
          match_id: match.id,
          match_key: r.match_key,
          existing: match.fact_kind,
          incoming: r.fact_kind ?? null,
        },
      });
    }

    if (decision.action !== "write") {
      if (Object.keys(decision.patch).length > 0) {
        const { error } = await admin
          .from("matches")
          .update(decision.patch)
          .eq("id", match.id);
        if (error) {
          log.push(`results update failed: ${error.message}`);
          return { ok: false, error: error.message, log };
        }
        updated += 1;
      }
      const heldWinner = match.voided ? null : match.winner_player_id;
      if (decision.action !== "conflict" && heldWinner) {
        const did = await writeWinnerIntoParent(
          admin,
          id,
          match.round,
          match.index_in_round,
          heldWinner,
          now
        );
        if (did) advanced += 1;
      }
      const liveError = await releaseProvisionalLive(admin, match, decision.action, {
        official_score: Object.prototype.hasOwnProperty.call(
          decision.patch,
          "official_score"
        )
          ? (decision.patch.official_score as string | null)
          : match.official_score,
        winner_ref: r.winner_ref ?? null,
      }, log);
      if (liveError) return { ok: false, error: liveError, log };
      skipped.push({
        reason: settledFactSkipReason(decision),
        id: match.id,
      });
      continue;
    }

    const patch: Record<string, unknown> = {
      voided,
      winner_player_id: voided ? null : winnerId,
      settled_at: now,
      official_score: decision.patch.official_score ?? null,
      fact_kind: decision.patch.fact_kind ?? null,
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

    if (
      r.provider_match_id &&
      String(r.provider_match_id) !== String(match.provider_match_id || "")
    ) {
      patch.provider_match_id = String(r.provider_match_id);
    }

    if (patch.provider_match_id && (r.match_key || matchKeyOf(match))) {
      const moved = await relocateProviderMatchId(admin, id, {
        match_key: r.match_key || matchKeyOf(match),
        provider_match_id: String(patch.provider_match_id),
      });
      if (!moved.ok) {
        log.push(`results update failed: ${moved.error}`);
        return { ok: false, error: moved.error, log };
      }
    }

    // Write matches first — never latch a claim before the durable row exists.
    const { error } = await admin
      .from("matches")
      .update(patch)
      .eq("id", match.id);
    if (error) {
      log.push(`results update failed: ${error.message}`);
      return { ok: false, error: error.message, log };
    }
    updated += 1;

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
      }
    } else if (claimStatus === "noop") {
      // Claim already matches this outcome — matches row is now durable; continue to advance.
      log.push(`claim noop after write for ${matchKeyOf(match)}`);
    }

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

    const liveError = await releaseProvisionalLive(admin, match, "write", {
      official_score: (patch.official_score as string | null) ?? null,
      winner_ref: r.winner_ref ?? null,
    }, log);
    if (liveError) return { ok: false, error: liveError, log };
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

/**
 * Record a live row that differs from the official fact, then drop it.
 * A winner conflict records against the stored winner and keeps the live row.
 * A failed record fails the apply. The incoming socket winner is not the official ref.
 */
async function releaseProvisionalLive(
  admin: SupabaseClient,
  match: MatchRow,
  action: string,
  official: { official_score?: string | null; winner_ref?: string | null },
  log: string[]
): Promise<string | null> {
  const conflict = action === "conflict";
  if (!clearsProvisionalLive(action) && !conflict) return null;
  const winner = await officialWinnerRef(admin, match, official.winner_ref ?? null, conflict);
  if (winner.error) {
    const message = `live disagreement not recorded: ${winner.error}`;
    log.push(message);
    return message;
  }
  const cleared = await clearProvisionalLive(
    admin,
    match.id,
    {
      official_score: official.official_score ?? null,
      winner_ref: winner.ref,
      public_ref: match.external_ref ?? null,
    },
    { retain: conflict }
  );
  if (cleared.recordError) {
    const message = `live disagreement not recorded: ${cleared.recordError}`;
    log.push(message);
    return message;
  }
  if (!cleared.ok && !cleared.missing) {
    const message = `live clear failed: ${cleared.error}`;
    log.push(message);
    return message;
  }
  return null;
}

async function officialWinnerRef(
  admin: SupabaseClient,
  match: MatchRow,
  incoming: string | null,
  conflict: boolean
): Promise<{ ref: string | null; error?: string }> {
  if (!conflict && incoming) return { ref: incoming };
  if (match.voided || !match.winner_player_id) return { ref: null };
  const { data, error } = await admin
    .from("players")
    .select("provider_id")
    .eq("id", match.winner_player_id)
    .maybeSingle();
  if (error) return { ref: null, error: error.message };
  const id = data?.provider_id == null ? "" : String(data.provider_id).trim();
  return { ref: id || null };
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

/** Advance every settled winner into its parent side (idempotent heal). */
async function healSettledAdvances(
  admin: SupabaseClient,
  tournamentId: string
): Promise<number> {
  const { data: settled } = await admin
    .from("matches")
    .select("round, index_in_round, winner_player_id")
    .eq("tournament_id", tournamentId)
    .not("winner_player_id", "is", null)
    .eq("voided", false)
    .order("round", { ascending: true })
    .order("index_in_round", { ascending: true });
  let n = 0;
  const now = new Date().toISOString();
  for (const m of settled ?? []) {
    if (!m.winner_player_id) continue;
    const did = await writeWinnerIntoParent(
      admin,
      tournamentId,
      Number(m.round),
      Number(m.index_in_round),
      String(m.winner_player_id),
      now
    );
    if (did) n += 1;
  }
  return n;
}

type MatchRow = {
  id: string;
  round: number;
  index_in_round: number;
  side_a_player_id: string | null;
  side_b_player_id: string | null;
  provider_match_id: string | null;
  winner_player_id: string | null;
  voided: boolean | null;
  settled_at: string | null;
  official_score: string | null;
  fact_kind: string | null;
  external_ref: string | null;
};

type MatchLookup = { ok: true; row: MatchRow | null } | { ok: false; error: string };

async function readMatch(
  query: PromiseLike<{
    data: MatchRow | null;
    error: { message?: string } | null;
  }>
): Promise<MatchLookup> {
  const looked = matchLookupFromQuery(await query);
  if (!looked.ok) return looked;
  return { ok: true, row: (looked.row as MatchRow | null) ?? null };
}

async function findMatch(
  admin: SupabaseClient,
  tournamentId: string,
  r: {
    match_id?: string;
    provider_match_id?: string;
    match_key?: string;
  }
): Promise<MatchLookup> {
  const cols =
    "id, round, index_in_round, side_a_player_id, side_b_player_id, provider_match_id, winner_player_id, voided, settled_at, official_score, fact_kind, external_ref";
  if (r.match_id) {
    return readMatch(
      admin
        .from("matches")
        .select(cols)
        .eq("id", r.match_id)
        .eq("tournament_id", tournamentId)
        .maybeSingle()
    );
  }

  // Prefer bracket key over provider_match_id. Local rows can carry stale /
  // synthetic ids (e.g. "802") that do not match the results archive.
  if (r.match_key) {
    const parsed = parseMatchKey(r.match_key);
    if (parsed) {
      const bySlot = await readMatch(
        admin
          .from("matches")
          .select(cols)
          .eq("tournament_id", tournamentId)
          .eq("round", parsed.round)
          .eq("index_in_round", parsed.indexInRound)
          .maybeSingle()
      );
      if (!bySlot.ok || bySlot.row) return bySlot;
    }
  }

  if (r.provider_match_id) {
    return readMatch(
      admin
        .from("matches")
        .select(cols)
        .eq("tournament_id", tournamentId)
        .eq("provider_match_id", String(r.provider_match_id))
        .maybeSingle()
    );
  }

  return { ok: true, row: null };
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
