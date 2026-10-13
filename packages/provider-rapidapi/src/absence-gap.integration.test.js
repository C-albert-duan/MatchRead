/**
 * Local Postgres: read the official seats, classify with the reconciler,
 * write the ops signal, and apply a winner only when the absence does not block.
 *
 * Requires the local Supabase stack (npm run test:db).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { describe, it, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  absenceObservability,
  classifyPlayerAbsences,
} from "./reconcile-provider.js";

const API_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";

function serviceRoleKey() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fromEnv) return fromEnv;
  const out = execSync("npx supabase status -o env", {
    encoding: "utf8",
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const line = out.split(/\r?\n/).find((row) => row.startsWith("SERVICE_ROLE_KEY="));
  const value = line?.slice("SERVICE_ROLE_KEY=".length).replace(/^"|"$/g, "") ?? "";
  if (!value) throw new Error("local service role key was not found");
  return value;
}

/** @type {import("@supabase/supabase-js").SupabaseClient} */
let admin;

const SLUGS = ["pgtap-m18-wd", "pgtap-m18-gap", "pgtap-m18-ok"];
const PLAYER_IDS = [
  "pgtap-m18-wd-a",
  "pgtap-m18-wd-gone",
  "pgtap-m18-gap-a",
  "pgtap-m18-gap-up",
  "pgtap-m18-ok-a",
  "pgtap-m18-ok-b",
];

async function cleanup() {
  const { data: events } = await admin
    .from("tournaments")
    .select("id")
    .in("slug", SLUGS);
  const ids = (events ?? []).map((row) => row.id);
  if (ids.length) {
    await admin.from("tournaments").delete().in("id", ids);
  }
  await admin.from("players").delete().in("provider_id", PLAYER_IDS);
  for (const slug of SLUGS) {
    await admin.from("ops_events").delete().filter("payload->>slug", "eq", slug);
  }
}

async function playerId(providerId, lastName) {
  const { data, error } = await admin
    .from("players")
    .upsert({ provider_id: providerId, last_name: lastName }, { onConflict: "provider_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * @param {{
 *   slug: string,
 *   providerId: string,
 *   seats: Array<{ position: number, kind: "player"|"bye", providerId?: string, lastName?: string }>,
 * }} spec
 */
async function seedDraw(spec) {
  const { data: event, error } = await admin
    .from("tournaments")
    .insert({
      slug: spec.slug,
      name: "Absence Fixture",
      tour: "atp",
      starts_on: "2026-08-12",
      ends_on: "2026-08-13",
      draw_size: 2,
      provider_id: spec.providerId,
    })
    .select("id, slug, provider_id")
    .single();
  if (error) throw new Error(error.message);

  /** @type {Record<string, string>} */
  const uuids = {};
  const seatRows = [];
  for (const seat of spec.seats) {
    let playerUuid = null;
    if (seat.kind === "player" && seat.providerId && seat.lastName) {
      playerUuid = await playerId(seat.providerId, seat.lastName);
      uuids[seat.providerId] = playerUuid;
    }
    seatRows.push({
      tournament_id: event.id,
      position: seat.position,
      kind: seat.kind,
      player_id: playerUuid,
      tbd_label: null,
    });
  }
  const { error: seatErr } = await admin.from("seats").insert(seatRows);
  if (seatErr) throw new Error(seatErr.message);

  const sideA = spec.seats.find((seat) => seat.position === 0);
  const sideB = spec.seats.find((seat) => seat.position === 1);
  const { data: match, error: matchErr } = await admin
    .from("matches")
    .insert({
      tournament_id: event.id,
      round: 0,
      index_in_round: 0,
      side_a_player_id: sideA?.providerId ? uuids[sideA.providerId] : null,
      side_b_player_id: sideB?.kind === "player" && sideB.providerId ? uuids[sideB.providerId] : null,
    })
    .select("id")
    .single();
  if (matchErr) throw new Error(matchErr.message);

  const { data: stored, error: readErr } = await admin
    .from("seats")
    .select("position, players(provider_id)")
    .eq("tournament_id", event.id);
  if (readErr) throw new Error(readErr.message);
  const seats = (stored ?? []).map((row) => {
    const person = Array.isArray(row.players) ? row.players[0] : row.players;
    return {
      position: row.position,
      provider_player_id: person?.provider_id ?? null,
    };
  });
  return { event, matchId: match.id, uuids, seats };
}

/**
 * Same gate as sync-facts: write the signal, then settle only when the
 * absence class does not block.
 */
async function persistClassified(draw, absences, signals, winnerProviderId) {
  if (signals.length) {
    const { error } = await admin.from("ops_events").insert(
      signals.map((signal) => ({
        kind: signal.kind,
        name: signal.name,
        payload: signal.payload,
      }))
    );
    if (error) throw new Error(error.message);
  }
  if (absences.settleBlocked) return { applied: false };
  const winnerId = draw.uuids[winnerProviderId];
  const { error: upErr } = await admin
    .from("matches")
    .update({
      winner_player_id: winnerId,
      settled_at: "2026-08-12T18:00:00.000Z",
      official_score: "6-3 6-4",
      fact_kind: "played",
    })
    .eq("id", draw.matchId);
  if (upErr) throw new Error(upErr.message);
  const { data: claim, error: claimErr } = await admin.rpc("claim_settlement", {
    p_match: draw.matchId,
    p_outcome: "winner",
    p_winner: winnerId,
    p_run: null,
  });
  if (claimErr) throw new Error(claimErr.message);
  return { applied: true, claim };
}

async function opsFor(slug) {
  const { data, error } = await admin
    .from("ops_events")
    .select("kind, name, payload")
    .filter("payload->>slug", "eq", slug);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function winnerOf(matchId) {
  const { data, error } = await admin
    .from("matches")
    .select("winner_player_id, settled_at")
    .eq("id", matchId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

describe("absence classification against local Postgres", () => {
  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await cleanup();
  });

  after(async () => {
    if (admin) await cleanup();
  });

  it("classifies a player missing locally and upstream as a withdrawal and still settles", async () => {
    const draw = await seedDraw({
      slug: "pgtap-m18-wd",
      providerId: "pgtap-m18-wd-event",
      seats: [
        { position: 0, kind: "player", providerId: "pgtap-m18-wd-a", lastName: "Alpha" },
        { position: 1, kind: "bye" },
      ],
    });
    const absences = classifyPlayerAbsences({
      seats: draw.seats,
      archiveRows: [
        {
          id: "fx-wd",
          player1Id: "pgtap-m18-wd-a",
          player2Id: "pgtap-m18-wd-gone",
          match_winner: "pgtap-m18-wd-a",
        },
      ],
      fixtures: [{ id: "fx-1", player1Id: "pgtap-m18-wd-a", player2Id: "3700" }],
      entries: [{ id: "pgtap-m18-wd-a" }],
    });
    const signals = absenceObservability({
      absences,
      ref: draw.event.slug,
      slug: draw.event.slug,
      tour: "atp",
      providerTournamentId: draw.event.provider_id,
      fixturesLoaded: true,
      entriesLoaded: true,
    });
    const persisted = await persistClassified(
      draw,
      absences,
      signals,
      "pgtap-m18-wd-a"
    );

    assert.deepEqual(absences.withdrawal, ["pgtap-m18-wd-gone"]);
    assert.equal(absences.ingestionGap.length, 0);
    assert.equal(absences.settleBlocked, false);
    assert.equal(signals[0].kind, "reconcile");
    assert.equal(signals[0].name, "withdrawal");
    assert.equal(persisted.applied, true);
    assert.equal(persisted.claim, "claimed");
    const rows = await opsFor("pgtap-m18-wd");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "reconcile");
    assert.equal(rows[0].name, "withdrawal");
    assert.deepEqual(rows[0].payload.provider_player_ids, ["pgtap-m18-wd-gone"]);
    const match = await winnerOf(draw.matchId);
    assert.equal(match.winner_player_id, draw.uuids["pgtap-m18-wd-a"]);
    assert.ok(match.settled_at);
  });

  it("records an ingestion gap at error severity and does not settle", async () => {
    const draw = await seedDraw({
      slug: "pgtap-m18-gap",
      providerId: "pgtap-m18-gap-event",
      seats: [
        { position: 0, kind: "player", providerId: "pgtap-m18-gap-a", lastName: "Beta" },
        { position: 1, kind: "bye" },
      ],
    });
    const absences = classifyPlayerAbsences({
      seats: draw.seats,
      archiveRows: [
        {
          id: "fx-gap",
          player1Id: "pgtap-m18-gap-a",
          player2Id: "pgtap-m18-gap-up",
          match_winner: "pgtap-m18-gap-a",
        },
      ],
      fixtures: [
        { id: "fx-2", player1Id: "pgtap-m18-gap-a", player2Id: "pgtap-m18-gap-up" },
      ],
      entries: [{ id: "pgtap-m18-gap-a" }],
    });
    const signals = absenceObservability({
      absences,
      ref: draw.event.slug,
      slug: draw.event.slug,
      tour: "atp",
      providerTournamentId: draw.event.provider_id,
      fixturesLoaded: true,
      entriesLoaded: true,
    });
    const persisted = await persistClassified(
      draw,
      absences,
      signals,
      "pgtap-m18-gap-a"
    );

    assert.deepEqual(absences.ingestionGap, ["pgtap-m18-gap-up"]);
    assert.equal(absences.withdrawal.length, 0);
    assert.equal(absences.settleBlocked, true);
    assert.equal(signals.some((row) => row.name === "withdrawal"), false);
    assert.equal(signals[0].kind, "error");
    assert.equal(signals[0].name, "ingestion_gap");
    assert.equal(signals[0].payload.severity, "error");
    assert.equal(persisted.applied, false);
    const rows = await opsFor("pgtap-m18-gap");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "error");
    assert.equal(rows[0].name, "ingestion_gap");
    assert.equal(rows[0].payload.severity, "error");
    assert.equal(rows[0].payload.ref, "pgtap-m18-gap");
    assert.equal(rows[0].payload.provider_tournament_id, "pgtap-m18-gap-event");
    const match = await winnerOf(draw.matchId);
    assert.equal(match.winner_player_id, null);
    assert.equal(match.settled_at, null);
    const { data: claims, error } = await admin
      .from("settlement_claims")
      .select("match_id")
      .eq("match_id", draw.matchId);
    if (error) throw new Error(error.message);
    assert.equal(claims.length, 0);
  });

  it("settles a draw whose players are already on the local sheet", async () => {
    const draw = await seedDraw({
      slug: "pgtap-m18-ok",
      providerId: "pgtap-m18-ok-event",
      seats: [
        { position: 0, kind: "player", providerId: "pgtap-m18-ok-a", lastName: "Gamma" },
        { position: 1, kind: "player", providerId: "pgtap-m18-ok-b", lastName: "Delta" },
      ],
    });
    const absences = classifyPlayerAbsences({
      seats: draw.seats,
      archiveRows: [
        {
          id: "fx-ok",
          player1Id: "pgtap-m18-ok-a",
          player2Id: "pgtap-m18-ok-b",
          match_winner: "pgtap-m18-ok-a",
        },
      ],
      fixtures: [
        { id: "fx-3", player1Id: "pgtap-m18-ok-a", player2Id: "pgtap-m18-ok-b" },
      ],
      entries: [{ id: "pgtap-m18-ok-a" }, { id: "pgtap-m18-ok-b" }],
    });
    const signals = absenceObservability({
      absences,
      ref: draw.event.slug,
      slug: draw.event.slug,
      tour: "atp",
      providerTournamentId: draw.event.provider_id,
      fixturesLoaded: true,
      entriesLoaded: true,
    });
    const persisted = await persistClassified(
      draw,
      absences,
      signals,
      "pgtap-m18-ok-a"
    );

    assert.equal(absences.settleBlocked, false);
    assert.equal(absences.withdrawal.length, 0);
    assert.equal(absences.ingestionGap.length, 0);
    assert.equal(signals.length, 0);
    assert.equal(persisted.applied, true);
    assert.equal(persisted.claim, "claimed");
    assert.equal((await opsFor("pgtap-m18-ok")).length, 0);
    const match = await winnerOf(draw.matchId);
    assert.equal(match.winner_player_id, draw.uuids["pgtap-m18-ok-a"]);
    assert.ok(match.settled_at);
  });
});
