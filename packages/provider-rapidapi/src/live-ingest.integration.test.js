/**
 * A terminal socket-mapped frame must not settle.
 * Runs through ingestLiveFrames, the same function sync-facts calls.
 *
 * Requires the local Supabase stack (npm run test:db).
 * Captured live rows are only InPlay, so the terminal marker is the replay
 * harness field. The event id is the mapped socket id.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { describe, it, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizePairKey } from "./event-mapper.js";
import { ingestLiveFrames } from "./live-ingest.js";
import { acceptForwardedLive } from "../../../supabase/functions/_shared/project-live.ts";
import { noteListenerInstance } from "./listener-instance.js";
import { applyMatchResults } from "../../../supabase/functions/_shared/apply-results.ts";
import { derivePointFlags } from "../../core/src/live/point-flag.ts";

const API_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SLUG = "pgtap-live-socket";
const PROVIDER_EVENT = "91001";
const PLAYER_IDS = ["sock-a", "sock-b"];
const SOCKET_ID = "evt-sock-final";

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

async function cleanup() {
  const { data: events } = await admin.from("tournaments").select("id").eq("slug", SLUG);
  const ids = (events ?? []).map((row) => row.id);
  if (ids.length) await admin.from("tournaments").delete().in("id", ids);
  await admin.from("players").delete().in("provider_id", PLAYER_IDS);
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

async function seed() {
  const { data: event, error } = await admin
    .from("tournaments")
    .insert({
      slug: SLUG,
      name: "Socket Final Fixture",
      tour: "atp",
      starts_on: "2026-10-09",
      ends_on: "2026-10-10",
      draw_size: 2,
      provider_id: PROVIDER_EVENT,
    })
    .select("id, slug, provider_id")
    .single();
  if (error) throw new Error(error.message);

  const sideA = await playerId("sock-a", "Alpha");
  const sideB = await playerId("sock-b", "Beta");
  const { error: seatErr } = await admin.from("seats").insert([
    { tournament_id: event.id, position: 0, kind: "player", player_id: sideA },
    { tournament_id: event.id, position: 1, kind: "player", player_id: sideB },
  ]);
  if (seatErr) throw new Error(seatErr.message);

  const { data: first, error: firstErr } = await admin
    .from("matches")
    .insert({
      tournament_id: event.id,
      round: 0,
      index_in_round: 0,
      side_a_player_id: sideA,
      side_b_player_id: sideB,
    })
    .select("id, external_ref")
    .single();
  if (firstErr) throw new Error(firstErr.message);

  const { data: parent, error: parentErr } = await admin
    .from("matches")
    .insert({
      tournament_id: event.id,
      round: 1,
      index_in_round: 0,
    })
    .select("id")
    .single();
  if (parentErr) throw new Error(parentErr.message);

  const { error: mapErr } = await admin.from("event_map").insert({
    tournament_id: event.id,
    match_id: first.id,
    pair_key: normalizePairKey("sock-a", "sock-b"),
    socket_event_id: SOCKET_ID,
    status: "mapped",
  });
  if (mapErr) throw new Error(mapErr.message);

  return { event, first, parent };
}

async function snapshot(draw) {
  const { data: matches, error } = await admin
    .from("matches")
    .select(
      "id, round, index_in_round, side_a_player_id, side_b_player_id, winner_player_id, official_score, settled_at, voided"
    )
    .eq("tournament_id", draw.event.id)
    .order("round");
  if (error) throw new Error(error.message);

  const { data: seats, error: seatErr } = await admin
    .from("seats")
    .select("position, kind, player_id")
    .eq("tournament_id", draw.event.id)
    .order("position");
  if (seatErr) throw new Error(seatErr.message);

  const ids = (matches ?? []).map((row) => row.id);
  const { data: claims, error: claimErr } = await admin
    .from("settlement_claims")
    .select("match_id, outcome, winner_player_id")
    .in("match_id", ids);
  if (claimErr) throw new Error(claimErr.message);

  const { data: side, error: sideErr } = await admin
    .from("matches")
    .select("winner_side")
    .eq("id", draw.first.id)
    .maybeSingle();
  const winnerSide = sideErr ? null : side?.winner_side ?? null;
  if (sideErr && !/winner_side|schema cache|column/i.test(sideErr.message)) {
    throw new Error(sideErr.message);
  }

  return { matches, seats, claims: claims ?? [], winnerSide };
}

describe("does not settle from a socket event", () => {
  /** @type {Awaited<ReturnType<typeof seed>>} */
  let draw;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await cleanup();
    draw = await seed();
  });

  after(async () => {
    if (admin) await cleanup();
  });

  it("does not settle from a socket event", async () => {
    const before = await snapshot(draw);
    const log = [];
    const result = await ingestLiveFrames(
      admin,
      {
        id: draw.event.id,
        provider_id: PROVIDER_EVENT,
        slug: SLUG,
      },
      [
        {
          source: "replay",
          seq: 9,
          replayPhase: "terminal",
          replayWinnerId: "sock-a",
          id: SOCKET_ID,
          matchId: "sock-a-sock-b-91001-1",
          status: "InPlay",
          score: "6-4,6-2",
          receivedAt: "2026-10-09T18:00:00.000Z",
        },
      ],
      { dryRun: false, log }
    );

    assert.equal(result.applied, 1, log.join("\n") || "live ingestion did not apply");
    const after = await snapshot(draw);
    assert.deepEqual(after.matches, before.matches);
    assert.deepEqual(after.seats, before.seats);
    assert.deepEqual(after.claims, before.claims);
    assert.equal(after.winnerSide, null);
    assert.equal(before.winnerSide, null);
    for (const row of after.matches) {
      assert.equal(row.winner_player_id, null);
      assert.equal(row.official_score, null);
      assert.equal(row.settled_at, null);
      assert.equal(row.voided, false);
    }
    const parent = after.matches.find((row) => row.round === 1);
    assert.equal(parent.side_a_player_id, null);
    assert.equal(parent.side_b_player_id, null);

    const { data: live, error } = await admin
      .from("live_match_state")
      .select("phase, score_text, provisional_winner_ref")
      .eq("match_id", draw.first.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    assert.equal(live.phase, "provisional_final");
    assert.equal(live.score_text, "6-4,6-2");
    assert.ok(live.provisional_winner_ref);
  });

  it("archives an unmapped event and does not change live or official state", async () => {
    const before = await snapshot(draw);
    const { data: liveBefore, error: liveBeforeErr } = await admin
      .from("live_match_state")
      .select("match_id, phase, score_text, provisional_winner_ref")
      .eq("match_id", draw.first.id)
      .maybeSingle();
    if (liveBeforeErr) throw new Error(liveBeforeErr.message);

    const raw = {
      id: "live-unknown",
      tourType: "atp",
      matchId: "9-8-91001-1",
      status: "InPlay",
      score: "6-0,6-0",
      player1: { name: "Alpha" },
      player2: { name: "Beta" },
      startTimestamp: 1710000000,
      receivedAt: "2026-10-09T18:05:00.000Z",
    };
    const log = [];
    const result = await ingestLiveFrames(
      admin,
      { id: draw.event.id, provider_id: PROVIDER_EVENT, slug: SLUG },
      [raw],
      { dryRun: false, log }
    );

    assert.equal(result.applied, 0, log.join("\n"));
    assert.equal(result.unmapped, 1);
    const after = await snapshot(draw);
    assert.deepEqual(after.matches, before.matches);
    assert.deepEqual(after.seats, before.seats);
    assert.deepEqual(after.claims, before.claims);

    const { data: liveAfter, error: liveAfterErr } = await admin
      .from("live_match_state")
      .select("match_id, phase, score_text, provisional_winner_ref")
      .eq("match_id", draw.first.id)
      .maybeSingle();
    if (liveAfterErr) throw new Error(liveAfterErr.message);
    assert.deepEqual(liveAfter, liveBefore);

    const { data: archived, error: archiveErr } = await admin
      .from("unmapped_live_events")
      .select("reason, provider_event_id, tour, payload")
      .eq("provider_event_id", "live-unknown");
    if (archiveErr) throw new Error(archiveErr.message);
    assert.equal(archived.length, 1);
    assert.equal(archived[0].reason, "no match");
    assert.equal(archived[0].tour, "atp");
    assert.deepEqual(archived[0].payload, raw);

    const { data: logged, error: logErr } = await admin
      .from("ops_events")
      .select("kind, name, payload")
      .eq("name", "unmapped_event")
      .contains("payload", { provider_event_id: "live-unknown" });
    if (logErr) throw new Error(logErr.message);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].kind, "live");
    assert.equal(logged[0].payload.reason, "no match");
    assert.equal(logged[0].payload.tour, "atp");

    await admin.from("unmapped_live_events").delete().eq("provider_event_id", "live-unknown");
    await admin
      .from("ops_events")
      .delete()
      .eq("name", "unmapped_event")
      .contains("payload", { provider_event_id: "live-unknown" });
  });
});

describe("out-of-order live frame", () => {
  const slug = "pgtap-live-f04";
  const providerEvent = "91002";
  const playerIds = ["orda", "ordb"];
  /** @type {{ event: { id: string }, matchId: string }} */
  let draw;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);

    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug,
        name: "Live Order Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 2,
        provider_id: providerEvent,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const people = [];
    for (const [providerId, lastName] of [
      ["orda", "Alpha"],
      ["ordb", "Beta"],
    ]) {
      const { data, error: playerErr } = await admin
        .from("players")
        .upsert({ provider_id: providerId, last_name: lastName }, { onConflict: "provider_id" })
        .select("id")
        .single();
      if (playerErr) throw new Error(playerErr.message);
      people.push(data.id);
    }
    const { data: match, error: matchErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 0,
        index_in_round: 0,
        side_a_player_id: people[0],
        side_b_player_id: people[1],
      })
      .select("id")
      .single();
    if (matchErr) throw new Error(matchErr.message);
    draw = { event, matchId: match.id };
  });

  after(async () => {
    if (!admin) return;
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);
  });

  it("keeps the newer score when an older frame arrives later", async () => {
    const event = { id: draw.event.id, provider_id: providerEvent, slug };
    const matchId = "orda-ordb-91002-1";
    const early = {
      id: "fx-early",
      matchId,
      status: "InPlay",
      score: "1-0",
      points: "15-0",
      updatedAt: "2026-10-09T18:00:00.000Z",
      receivedAt: "2026-10-09T18:00:01.000Z",
    };
    const newer = {
      id: "fx-newer",
      matchId,
      status: "InPlay",
      score: "6-4,3-3",
      points: "30-0",
      updatedAt: "2026-10-09T18:05:00.000Z",
      receivedAt: "2026-10-09T18:05:01.000Z",
    };
    const older = {
      id: "fx-older",
      matchId,
      status: "InPlay",
      score: "0-0",
      points: "0-0",
      updatedAt: "2026-10-09T18:00:00.000Z",
      receivedAt: "2026-10-09T19:00:00.000Z",
    };

    const openLog = [];
    const opened = await ingestLiveFrames(admin, event, [early], { dryRun: false, log: openLog });
    assert.equal(opened.applied, 1, openLog.join("\n"));
    const advanceLog = [];
    const advanced = await ingestLiveFrames(admin, event, [newer], { dryRun: false, log: advanceLog });
    assert.equal(advanced.applied, 1, advanceLog.join("\n"));

    const { data: before, error: beforeErr } = await admin
      .from("matches")
      .select("winner_player_id, official_score, settled_at, voided")
      .eq("id", draw.matchId)
      .single();
    if (beforeErr) throw new Error(beforeErr.message);

    const late = [];
    const rewind = await ingestLiveFrames(admin, event, [older], { dryRun: false, log: late });
    assert.equal(rewind.applied, 0, late.join("\n"));
    assert.equal(rewind.ignored, 1);

    const { data: live, error } = await admin
      .from("live_match_state")
      .select("phase, score_text, points_text, occurred_at, received_at")
      .eq("match_id", draw.matchId)
      .single();
    if (error) throw new Error(error.message);
    assert.equal(live.phase, "in_play");
    assert.equal(live.score_text, "6-4,3-3");
    assert.equal(live.points_text, "30-0");
    assert.equal(new Date(live.occurred_at).toISOString(), "2026-10-09T18:05:00.000Z");
    assert.equal(new Date(live.received_at).toISOString(), "2026-10-09T18:05:01.000Z");

    const { data: after, error: afterErr } = await admin
      .from("matches")
      .select("winner_player_id, official_score, settled_at, voided")
      .eq("id", draw.matchId)
      .single();
    if (afterErr) throw new Error(afterErr.message);
    assert.deepEqual(after, before);
    assert.equal(after.winner_player_id, null);
    assert.equal(after.official_score, null);
    assert.equal(after.settled_at, null);
    assert.equal(after.voided, false);
  });
});

describe("unknown match", () => {
  const slug = "pgtap-live-f05";
  const providerEvent = "91003";
  const playerIds = ["f05a", "f05b"];
  const stamp = Date.now();
  const carriedId = `fx-f05-carried-${stamp}`;
  const otherId = `fx-f05-other-${stamp}`;
  const namedId = `fx-f05-named-${stamp}`;
  /** @type {{ event: { id: string }, matchId: string }} */
  let draw;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);

    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug,
        name: "Live Unknown Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 2,
        provider_id: providerEvent,
        ingestion_enabled: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const people = [];
    for (const [providerId, lastName] of [
      ["f05a", "Alpha"],
      ["f05b", "Beta"],
    ]) {
      const { data, error: playerErr } = await admin
        .from("players")
        .upsert({ provider_id: providerId, last_name: lastName }, { onConflict: "provider_id" })
        .select("id")
        .single();
      if (playerErr) throw new Error(playerErr.message);
      people.push(data.id);
    }
    const { data: match, error: matchErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 0,
        index_in_round: 0,
        side_a_player_id: people[0],
        side_b_player_id: people[1],
      })
      .select("id")
      .single();
    if (matchErr) throw new Error(matchErr.message);
    draw = { event, matchId: match.id };
  });

  after(async () => {
    if (!admin) return;
    const eventIds = [carriedId, otherId, namedId];
    await admin.from("unmapped_live_events").delete().in("provider_event_id", eventIds);
    for (const id of eventIds) {
      await admin.from("ops_events").delete().eq("name", "unmapped_event").contains("payload", {
        provider_event_id: id,
      });
    }
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);
  });

  it("archives an unknown match and alarms only for a carried tournament", async () => {
    const event = { id: draw.event.id, provider_id: providerEvent, slug };
    const known = {
      id: `fx-f05-known-${stamp}`,
      matchId: "f05a-f05b-91003-1",
      status: "InPlay",
      score: "4-2",
      points: "15-0",
      updatedAt: "2026-10-09T18:00:00.000Z",
      receivedAt: "2026-10-09T18:00:01.000Z",
    };
    const seeded = await ingestLiveFrames(admin, event, [known], { dryRun: false, log: [] });
    assert.equal(seeded.applied, 1);

    const { data: liveBefore, error: liveBeforeErr } = await admin
      .from("live_match_state")
      .select("match_id, phase, score_text, points_text")
      .eq("match_id", draw.matchId)
      .single();
    if (liveBeforeErr) throw new Error(liveBeforeErr.message);
    const { data: officialBefore, error: officialBeforeErr } = await admin
      .from("matches")
      .select("id, winner_player_id, official_score, settled_at, voided, side_a_player_id, side_b_player_id")
      .eq("tournament_id", draw.event.id);
    if (officialBeforeErr) throw new Error(officialBeforeErr.message);

    const names = {
      player1: { name: "Alpha" },
      player2: { name: "Beta" },
      startTimestamp: 1710000000,
    };
    const carried = {
      id: carriedId,
      seasonId: providerEvent,
      matchId: "x1-x2-91003-1",
      tourType: "atp",
      status: "InPlay",
      score: "6-0,6-0",
      ...names,
      receivedAt: "2026-10-09T18:10:00.000Z",
    };
    const other = {
      id: otherId,
      matchId: "f05a-f05b-91999-1",
      tourType: "atp",
      status: "InPlay",
      score: "6-1,6-1",
      ...names,
      receivedAt: "2026-10-09T18:11:00.000Z",
    };
    const named = {
      id: namedId,
      seasonId: "Alpha",
      matchId: "x1-x2-91003-1",
      tourType: "atp",
      status: "InPlay",
      score: "6-2,6-2",
      ...names,
      receivedAt: "2026-10-09T18:12:00.000Z",
    };

    const log = [];
    const result = await acceptForwardedLive(admin, [carried, other, named], log);
    assert.equal(result.unmappedCarried, 1, log.join("\n"));
    assert.deepEqual(result.carriedProviderIds, [providerEvent]);
    assert.ok(log.some((line) => line.includes(carriedId) && line.includes("unmapped_event")));
    assert.ok(log.some((line) => line.includes(otherId)));
    assert.ok(log.some((line) => line.includes("unparsed match id")));

    const { data: archived, error: archiveErr } = await admin
      .from("unmapped_live_events")
      .select("reason, provider_event_id")
      .in("provider_event_id", [carriedId, otherId, namedId]);
    if (archiveErr) throw new Error(archiveErr.message);
    const reasons = new Map((archived ?? []).map((row) => [row.provider_event_id, row.reason]));
    assert.equal(reasons.get(carriedId), "no match");
    assert.equal(reasons.get(otherId), "tournament not carried");
    assert.equal(reasons.get(namedId), "unparsed match id");

    const { data: logged, error: logErr } = await admin
      .from("ops_events")
      .select("name, payload")
      .eq("name", "unmapped_event")
      .in("payload->>provider_event_id", [carriedId, otherId, namedId]);
    if (logErr) throw new Error(logErr.message);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].payload.provider_event_id, carriedId);
    assert.equal(logged[0].payload.provider_tournament_id, providerEvent);
    assert.equal(logged[0].payload.reason, "no match");
    assert.equal(Object.hasOwn(logged[0].payload, "player1"), false);
    assert.equal(JSON.stringify(logged[0].payload).includes("Alpha"), false);

    const { data: raw, error: rawErr } = await admin
      .from("platform_events")
      .select("provider_event_id")
      .in("provider_event_id", [carriedId, otherId, namedId]);
    if (rawErr) throw new Error(rawErr.message);
    assert.equal(raw.length, 3);

    const { data: liveAfter, error: liveAfterErr } = await admin
      .from("live_match_state")
      .select("match_id, phase, score_text, points_text")
      .eq("match_id", draw.matchId)
      .single();
    if (liveAfterErr) throw new Error(liveAfterErr.message);
    assert.deepEqual(liveAfter, liveBefore);
    assert.equal(liveAfter.score_text, "4-2");

    const { data: officialAfter, error: officialAfterErr } = await admin
      .from("matches")
      .select("id, winner_player_id, official_score, settled_at, voided, side_a_player_id, side_b_player_id")
      .eq("tournament_id", draw.event.id);
    if (officialAfterErr) throw new Error(officialAfterErr.message);
    assert.deepEqual(officialAfter, officialBefore);
    assert.equal(officialAfter.length, 1);
    assert.equal(officialAfter[0].winner_player_id, null);
    assert.equal(officialAfter[0].official_score, null);
  });
});

describe("missing player mapping", () => {
  const slug = "pgtap-live-f06";
  const providerEvent = "91004";
  const playerIds = ["f06a"];
  const socketId = "fx-f06-known";
  const lostId = "fx-f06-lost";
  /** @type {{ event: { id: string }, matchId: string, sideA: string }} */
  let draw;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);

    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug,
        name: "Live Side Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 2,
        provider_id: providerEvent,
        ingestion_enabled: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: player, error: playerErr } = await admin
      .from("players")
      .upsert({ provider_id: "f06a", last_name: "Alpha" }, { onConflict: "provider_id" })
      .select("id")
      .single();
    if (playerErr) throw new Error(playerErr.message);

    const { data: match, error: matchErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 0,
        index_in_round: 0,
        side_a_player_id: player.id,
        side_b_player_id: null,
      })
      .select("id")
      .single();
    if (matchErr) throw new Error(matchErr.message);

    const { error: mapErr } = await admin.from("event_map").insert({
      tournament_id: event.id,
      match_id: match.id,
      pair_key: "f06a|open",
      socket_event_id: socketId,
      status: "mapped",
    });
    if (mapErr) throw new Error(mapErr.message);
    draw = { event, matchId: match.id, sideA: player.id };
  });

  after(async () => {
    if (!admin) return;
    await admin.from("unmapped_live_events").delete().eq("provider_event_id", lostId);
    await admin.from("ops_events").delete().eq("name", "unmapped_event").contains("payload", {
      provider_event_id: lostId,
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", [...playerIds, "z9"]);
  });

  it("stores the score with no serve side and does not invent the open seat", async () => {
    const event = { id: draw.event.id, provider_id: providerEvent, slug };
    const known = {
      id: socketId,
      matchId: "f06a-z9-91004-1",
      status: "InPlay",
      score: "3-2",
      points: "40-30",
      indicator: "2",
      player1: { name: "Alpha" },
      player2: { name: "Beta" },
      updatedAt: "2026-10-09T18:00:00.000Z",
      receivedAt: "2026-10-09T18:00:01.000Z",
    };
    const openLog = [];
    const opened = await ingestLiveFrames(admin, event, [known], { dryRun: false, log: openLog });
    assert.equal(opened.applied, 1, openLog.join("\n"));
    assert.equal(opened.unmapped, 0);

    const { data: live, error: liveErr } = await admin
      .from("live_match_state")
      .select("phase, score_text, points_text, serving_side, provisional_winner_ref")
      .eq("match_id", draw.matchId)
      .single();
    if (liveErr) throw new Error(liveErr.message);
    assert.equal(live.phase, "in_play");
    assert.equal(live.score_text, "3-2");
    assert.equal(live.points_text, "40-30");
    assert.equal(live.serving_side, null);
    assert.equal(live.provisional_winner_ref, null);

    const lost = {
      id: lostId,
      matchId: "f06a-z9-91004-1",
      status: "InPlay",
      score: "6-0",
      points: "0-0",
      indicator: "1",
      player1: { name: "Alpha" },
      player2: { name: "Beta" },
      updatedAt: "2026-10-09T18:05:00.000Z",
      receivedAt: "2026-10-09T18:05:01.000Z",
    };
    const late = [];
    const missed = await ingestLiveFrames(admin, event, [lost], { dryRun: false, log: late });
    assert.equal(missed.applied, 0, late.join("\n"));
    assert.equal(missed.unmapped, 1);

    const { data: liveAfter, error: afterLiveErr } = await admin
      .from("live_match_state")
      .select("phase, score_text, points_text, serving_side, provisional_winner_ref")
      .eq("match_id", draw.matchId)
      .single();
    if (afterLiveErr) throw new Error(afterLiveErr.message);
    assert.deepEqual(liveAfter, live);

    const { data: official, error: officialErr } = await admin
      .from("matches")
      .select("side_a_player_id, side_b_player_id, winner_player_id, official_score, settled_at, voided")
      .eq("id", draw.matchId)
      .single();
    if (officialErr) throw new Error(officialErr.message);
    assert.equal(official.side_a_player_id, draw.sideA);
    assert.equal(official.side_b_player_id, null);
    assert.equal(official.winner_player_id, null);
    assert.equal(official.official_score, null);
    assert.equal(official.settled_at, null);
    assert.equal(official.voided, false);

    const { data: invented, error: playerErr } = await admin
      .from("players")
      .select("id")
      .eq("provider_id", "z9");
    if (playerErr) throw new Error(playerErr.message);
    assert.equal(invented.length, 0);

    const { data: archived, error: archiveErr } = await admin
      .from("unmapped_live_events")
      .select("reason")
      .eq("provider_event_id", lostId);
    if (archiveErr) throw new Error(archiveErr.message);
    assert.equal(archived.length, 1);
    assert.equal(archived[0].reason, "no match");
  });
});

describe("underivable flag", () => {
  const slug = "pgtap-live-f07";
  const providerEvent = "91005";
  const playerIds = ["f07a", "f07b"];
  /** @type {{ event: { id: string }, matchId: string }} */
  let draw;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);

    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug,
        name: "Live Flag Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 2,
        provider_id: providerEvent,
        ingestion_enabled: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const people = [];
    for (const [providerId, lastName] of [
      ["f07a", "Alpha"],
      ["f07b", "Beta"],
    ]) {
      const { data, error: playerErr } = await admin
        .from("players")
        .upsert({ provider_id: providerId, last_name: lastName }, { onConflict: "provider_id" })
        .select("id")
        .single();
      if (playerErr) throw new Error(playerErr.message);
      people.push(data.id);
    }
    const { data: match, error: matchErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 0,
        index_in_round: 0,
        side_a_player_id: people[0],
        side_b_player_id: people[1],
      })
      .select("id")
      .single();
    if (matchErr) throw new Error(matchErr.message);
    draw = { event, matchId: match.id };
  });

  after(async () => {
    if (!admin) return;
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);
  });

  it("stores no critical flag for a malformed or unusual score", async () => {
    const event = { id: draw.event.id, provider_id: providerEvent, slug };
    const matchId = "f07a-f07b-91005-1";
    const frames = [
      {
        id: "fx-f07",
        matchId,
        status: "InPlay",
        score: "5-2",
        points: "5-2",
        indicator: "1,0",
        critical: "break point",
        flag: "match point",
        updatedAt: "2026-10-09T18:00:00.000Z",
        receivedAt: "2026-10-09T18:00:01.000Z",
        score_text: "5-2",
        points_text: null,
      },
      {
        id: "fx-f07",
        matchId,
        status: "InPlay",
        score: "7-6(5)",
        points: "5-3",
        critical: "match point",
        updatedAt: "2026-10-09T18:05:00.000Z",
        receivedAt: "2026-10-09T18:05:01.000Z",
        score_text: null,
        points_text: null,
      },
      {
        id: "fx-f07",
        matchId,
        status: "InPlay",
        score: "6-6",
        points: "0-40",
        indicator: "1,0",
        critical: "break point",
        updatedAt: "2026-10-09T18:10:00.000Z",
        receivedAt: "2026-10-09T18:10:01.000Z",
        score_text: "6-6",
        points_text: "0-40",
      },
      {
        id: "fx-f07",
        matchId,
        status: "InPlay",
        score: "6-4, 5-4",
        points: "40-0",
        critical: "match point",
        updatedAt: "2026-10-09T18:15:00.000Z",
        receivedAt: "2026-10-09T18:15:01.000Z",
        score_text: null,
        points_text: "40-0",
      },
    ];

    for (const frame of frames) {
      const log = [];
      const result = await ingestLiveFrames(admin, event, [frame], { dryRun: false, log });
      assert.equal(result.applied, 1, log.join("\n"));
      const { data: live, error } = await admin
        .from("live_match_state")
        .select("phase, score_text, points_text, serving_side, flag, stats, provisional_winner_ref")
        .eq("match_id", draw.matchId)
        .single();
      if (error) throw new Error(error.message);
      assert.equal(live.phase, "in_play");
      assert.equal(live.score_text, frame.score_text);
      assert.equal(live.points_text, frame.points_text);
      assert.equal(live.serving_side, null);
      assert.equal(live.flag, "live");
      assert.equal(live.stats, null);
      assert.equal(live.provisional_winner_ref, null);
      assert.equal(
        derivePointFlags({
          oriented: false,
          sets: live.score_text,
          game: live.points_text,
          serving: live.serving_side,
          setsToWin: null,
        }),
        null
      );
      assert.equal(JSON.stringify(live).includes("break"), false);
      assert.equal(JSON.stringify(live).includes("match point"), false);
    }

    const { data: official, error: officialErr } = await admin
      .from("matches")
      .select("winner_player_id, official_score, settled_at, voided")
      .eq("id", draw.matchId)
      .single();
    if (officialErr) throw new Error(officialErr.message);
    assert.equal(official.winner_player_id, null);
    assert.equal(official.official_score, null);
    assert.equal(official.settled_at, null);
    assert.equal(official.voided, false);
  });
});

describe("REST and socket disagreement", () => {
  const slug = "pgtap-live-f15";
  const providerEvent = "91006";
  const playerIds = ["f15a", "f15b"];
  /** @type {{ event: { id: string }, matchId: string, parentId: string, sideA: string, sideB: string, publicRef: string }} */
  let draw;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);

    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug,
        name: "Live Rest Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 2,
        provider_id: providerEvent,
        ingestion_enabled: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const people = [];
    for (const [providerId, lastName] of [
      ["f15a", "Alpha"],
      ["f15b", "Beta"],
    ]) {
      const { data, error: playerErr } = await admin
        .from("players")
        .upsert({ provider_id: providerId, last_name: lastName }, { onConflict: "provider_id" })
        .select("id")
        .single();
      if (playerErr) throw new Error(playerErr.message);
      people.push(data.id);
    }
    const { data: match, error: matchErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 0,
        index_in_round: 0,
        side_a_player_id: people[0],
        side_b_player_id: people[1],
      })
      .select("id, external_ref")
      .single();
    if (matchErr) throw new Error(matchErr.message);
    const { data: parent, error: parentErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 1,
        index_in_round: 0,
      })
      .select("id")
      .single();
    if (parentErr) throw new Error(parentErr.message);
    draw = {
      event,
      matchId: match.id,
      parentId: parent.id,
      sideA: people[0],
      sideB: people[1],
      publicRef: match.external_ref,
    };
  });

  after(async () => {
    if (!admin) return;
    if (draw?.publicRef) {
      await admin.from("ops_events").delete().eq("name", "live_rest_disagreement").contains("payload", {
        public_ref: draw.publicRef,
      });
    }
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);
  });

  it("keeps the REST result when a socket frame disagrees", async () => {
    const event = { id: draw.event.id, provider_id: providerEvent, slug };
    const socket = {
      source: "replay",
      seq: 4,
      replayPhase: "terminal",
      replayWinnerId: "f15a",
      id: "fx-f15-socket",
      matchId: "f15a-f15b-91006-1",
      status: "InPlay",
      score: "6-4,6-2",
      receivedAt: "2026-10-09T18:00:00.000Z",
    };
    const liveLog = [];
    const lived = await ingestLiveFrames(admin, event, [socket], { dryRun: false, log: liveLog });
    assert.equal(lived.applied, 1, liveLog.join("\n"));

    const log = [];
    const applied = await applyMatchResults(admin, draw.event.id, [
      {
        match_key: "r0-m0",
        winner_ref: "f15b",
        official_score: "6-3,6-4",
        fact_kind: "played",
      },
    ], log);
    assert.equal(applied.ok, true, log.join("\n"));
    assert.equal(applied.updated, 1);
    assert.equal(applied.advanced, 1);

    const { data: official, error: officialErr } = await admin
      .from("matches")
      .select("winner_player_id, official_score, settled_at, voided, fact_kind")
      .eq("id", draw.matchId)
      .single();
    if (officialErr) throw new Error(officialErr.message);
    assert.equal(official.winner_player_id, draw.sideB);
    assert.equal(official.official_score, "6-3,6-4");
    assert.equal(official.voided, false);
    assert.ok(official.settled_at);
    assert.equal(official.fact_kind, "played");

    const { data: parent, error: parentErr } = await admin
      .from("matches")
      .select("side_a_player_id, side_b_player_id, winner_player_id, official_score")
      .eq("id", draw.parentId)
      .single();
    if (parentErr) throw new Error(parentErr.message);
    assert.equal(parent.side_a_player_id, draw.sideB);
    assert.equal(parent.side_b_player_id, null);
    assert.equal(parent.winner_player_id, null);
    assert.equal(parent.official_score, null);

    const { data: live, error: liveErr } = await admin
      .from("live_match_state")
      .select("match_id")
      .eq("match_id", draw.matchId)
      .maybeSingle();
    if (liveErr) throw new Error(liveErr.message);
    assert.equal(live, null);

    const { data: conflicts, error: conflictErr } = await admin
      .from("ops_events")
      .select("kind, name, payload")
      .eq("name", "live_rest_disagreement")
      .contains("payload", { public_ref: draw.publicRef });
    if (conflictErr) throw new Error(conflictErr.message);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].kind, "reconcile");
    assert.equal(conflicts[0].payload.live_score, "6-4,6-2");
    assert.equal(conflicts[0].payload.official_score, "6-3,6-4");
    assert.equal(conflicts[0].payload.live_winner_ref, "f15a");
    assert.equal(conflicts[0].payload.official_winner_ref, "f15b");

    const again = await ingestLiveFrames(admin, event, [
      { ...socket, seq: 5, receivedAt: "2026-10-09T18:10:00.000Z" },
    ], { dryRun: false, log: [] });
    assert.equal(again.applied, 0);
    assert.equal(again.disagreements, 1);

    const { data: after, error: afterErr } = await admin
      .from("matches")
      .select("winner_player_id, official_score, voided")
      .eq("id", draw.matchId)
      .single();
    if (afterErr) throw new Error(afterErr.message);
    assert.equal(after.winner_player_id, draw.sideB);
    assert.equal(after.official_score, "6-3,6-4");
    assert.equal(after.voided, false);

    const { data: parentAfter, error: parentAfterErr } = await admin
      .from("matches")
      .select("side_a_player_id, side_b_player_id")
      .eq("id", draw.parentId)
      .single();
    if (parentAfterErr) throw new Error(parentAfterErr.message);
    assert.equal(parentAfter.side_a_player_id, draw.sideB);
    assert.equal(parentAfter.side_b_player_id, null);

    const { data: liveAfter, error: liveAfterErr } = await admin
      .from("live_match_state")
      .select("match_id")
      .eq("match_id", draw.matchId)
      .maybeSingle();
    if (liveAfterErr) throw new Error(liveAfterErr.message);
    assert.equal(liveAfter, null);

    const { data: recorded, error: recordedErr } = await admin
      .from("ops_events")
      .select("payload")
      .eq("name", "live_rest_disagreement")
      .contains("payload", { public_ref: draw.publicRef });
    if (recordedErr) throw new Error(recordedErr.message);
    assert.equal(recorded.length, 2);
  });
});

describe("listener restart", () => {
  const slug = "pgtap-live-f19";
  const providerEvent = "91007";
  const playerIds = ["rsta", "rstb"];
  const stamp = Date.now();
  const eventIds = [`fx-f19-a-${stamp}`, `fx-f19-b-${stamp}`, `fx-f19-c-${stamp}`];
  /** @type {{ event: { id: string }, matchId: string }} */
  let draw;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);

    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug,
        name: "Live Restart Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 2,
        provider_id: providerEvent,
        ingestion_enabled: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const people = [];
    for (const [providerId, lastName] of [
      ["rsta", "Alpha"],
      ["rstb", "Beta"],
    ]) {
      const { data, error: playerErr } = await admin
        .from("players")
        .upsert({ provider_id: providerId, last_name: lastName }, { onConflict: "provider_id" })
        .select("id")
        .single();
      if (playerErr) throw new Error(playerErr.message);
      people.push(data.id);
    }
    const { data: match, error: matchErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 0,
        index_in_round: 0,
        side_a_player_id: people[0],
        side_b_player_id: people[1],
      })
      .select("id")
      .single();
    if (matchErr) throw new Error(matchErr.message);
    draw = { event, matchId: match.id };
  });

  after(async () => {
    if (!admin) return;
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);
  });

  it("absorbs a restarted snapshot without changing live or official state", async () => {
    const matchId = "rsta-rstb-91007-1";
    const snapshot = [
      {
        id: eventIds[0],
        matchId,
        status: "InPlay",
        score: "1-0",
        points: "15-0",
        updatedAt: "2026-10-09T18:00:00.000Z",
        receivedAt: "2026-10-09T18:00:01.000Z",
      },
      {
        id: eventIds[1],
        matchId,
        status: "InPlay",
        score: "2-0",
        points: "30-0",
        updatedAt: "2026-10-09T18:05:00.000Z",
        receivedAt: "2026-10-09T18:05:01.000Z",
      },
      {
        id: eventIds[2],
        matchId,
        status: "InPlay",
        score: "3-1",
        points: "40-0",
        updatedAt: "2026-10-09T18:10:00.000Z",
        receivedAt: "2026-10-09T18:10:01.000Z",
      },
    ];
    const firstLog = [];
    const first = await acceptForwardedLive(admin, snapshot, firstLog);
    assert.equal(first.tournaments, 1, firstLog.join("\n"));

    const { data: live, error: liveErr } = await admin
      .from("live_match_state")
      .select("phase, score_text, points_text, occurred_at")
      .eq("match_id", draw.matchId)
      .single();
    if (liveErr) throw new Error(liveErr.message);
    assert.equal(live.phase, "in_play");
    assert.equal(live.score_text, "3-1");
    assert.equal(live.points_text, "40-0");
    assert.equal(new Date(live.occurred_at).toISOString(), "2026-10-09T18:10:00.000Z");

    const restarted = snapshot.map((row) => ({
      ...row,
      receivedAt: "2026-10-09T19:00:00.000Z",
    }));
    const restartLog = [];
    const second = await acceptForwardedLive(admin, restarted, restartLog);
    assert.equal(second.tournaments, 0, restartLog.join("\n"));
    assert.ok(restartLog.some((line) => line.includes("live duplicate 3")));
    assert.equal(restartLog.some((line) => line.includes("live branch")), false);

    const { data: liveAfter, error: afterErr } = await admin
      .from("live_match_state")
      .select("phase, score_text, points_text, occurred_at")
      .eq("match_id", draw.matchId)
      .single();
    if (afterErr) throw new Error(afterErr.message);
    assert.deepEqual(liveAfter, live);

    const { data: official, error: officialErr } = await admin
      .from("matches")
      .select("winner_player_id, official_score, settled_at, voided")
      .eq("id", draw.matchId)
      .single();
    if (officialErr) throw new Error(officialErr.message);
    assert.equal(official.winner_player_id, null);
    assert.equal(official.official_score, null);
    assert.equal(official.settled_at, null);
    assert.equal(official.voided, false);

    const { data: raw, error: rawErr } = await admin
      .from("platform_events")
      .select("provider_event_id")
      .in("provider_event_id", eventIds);
    if (rawErr) throw new Error(rawErr.message);
    assert.equal(raw.length, 3);
  });
});

describe("two listeners", () => {
  const slug = "pgtap-live-f20";
  const providerEvent = "91008";
  const playerIds = ["f20a", "f20b"];
  const stamp = Date.now();
  const instanceA = `pair-a-${stamp}`;
  const instanceB = `pair-b-${stamp}`;
  const eventIds = [`fx-f20-a-${stamp}`, `fx-f20-b-${stamp}`];
  const staleId = `fx-f20-old-${stamp}`;
  /** @type {{ matchId: string }} */
  let draw;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);

    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug,
        name: "Live Pair Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 2,
        provider_id: providerEvent,
        ingestion_enabled: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const people = [];
    for (const [providerId, lastName] of [
      ["f20a", "Alpha"],
      ["f20b", "Beta"],
    ]) {
      const { data, error: playerErr } = await admin
        .from("players")
        .upsert({ provider_id: providerId, last_name: lastName }, { onConflict: "provider_id" })
        .select("id")
        .single();
      if (playerErr) throw new Error(playerErr.message);
      people.push(data.id);
    }
    const { data: match, error: matchErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 0,
        index_in_round: 0,
        side_a_player_id: people[0],
        side_b_player_id: people[1],
      })
      .select("id")
      .single();
    if (matchErr) throw new Error(matchErr.message);
    draw = { matchId: match.id };

    // Earlier cases leave a recent sync-facts instance. A null id is not an overlap.
    const { error: healthErr } = await admin.from("listener_health").upsert(
      {
        id: "sync-facts",
        transport: "rest",
        connection: "idle",
        instance_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (healthErr) throw new Error(healthErr.message);
  });

  after(async () => {
    if (!admin) return;
    await admin.from("ops_events").delete().eq("name", "listener_overlap").contains("payload", {
      current: instanceB,
    });
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) await admin.from("tournaments").delete().in("id", ids);
    await admin.from("players").delete().in("provider_id", playerIds);
  });

  it("absorbs a second listener post and records the overlap", async () => {
    const matchId = "f20a-f20b-91008-1";
    const snapshot = [
      {
        id: eventIds[0],
        matchId,
        status: "InPlay",
        score: "1-0",
        points: "15-0",
        updatedAt: "2026-10-09T18:00:00.000Z",
        receivedAt: "2026-10-09T18:00:01.000Z",
      },
      {
        id: eventIds[1],
        matchId,
        status: "InPlay",
        score: "4-2",
        points: "30-15",
        updatedAt: "2026-10-09T18:10:00.000Z",
        receivedAt: "2026-10-09T18:10:01.000Z",
      },
    ];

    const firstLog = [];
    await noteListenerInstance(admin, instanceA, firstLog);
    const first = await acceptForwardedLive(admin, snapshot, firstLog);
    assert.equal(first.tournaments, 1, firstLog.join("\n"));
    assert.equal(firstLog.some((line) => line.includes("listener overlap")), false);

    const { data: live, error: liveErr } = await admin
      .from("live_match_state")
      .select("phase, score_text, points_text, occurred_at")
      .eq("match_id", draw.matchId)
      .single();
    if (liveErr) throw new Error(liveErr.message);
    assert.equal(live.phase, "in_play");
    assert.equal(live.score_text, "4-2");
    assert.equal(live.points_text, "30-15");
    assert.equal(new Date(live.occurred_at).toISOString(), "2026-10-09T18:10:00.000Z");

    const secondLog = [];
    await noteListenerInstance(admin, instanceB, secondLog);
    assert.ok(secondLog.includes("listener overlap"), secondLog.join("\n"));
    const second = await acceptForwardedLive(
      admin,
      [
        ...snapshot.map((row) => ({ ...row, receivedAt: "2026-10-09T18:11:00.000Z" })),
        {
          id: staleId,
          matchId,
          status: "InPlay",
          score: "0-0",
          points: "0-0",
          updatedAt: "2026-10-09T17:00:00.000Z",
          receivedAt: "2026-10-09T18:11:00.000Z",
        },
      ],
      secondLog
    );
    assert.equal(second.tournaments, 1, secondLog.join("\n"));
    assert.ok(secondLog.some((line) => line.includes("live duplicate 2")));
    assert.ok(secondLog.some((line) => line.includes("applied=0") && line.includes("ignored=1")));

    const { data: liveAfter, error: afterErr } = await admin
      .from("live_match_state")
      .select("phase, score_text, points_text, occurred_at")
      .eq("match_id", draw.matchId)
      .single();
    if (afterErr) throw new Error(afterErr.message);
    assert.deepEqual(liveAfter, live);

    const { data: official, error: officialErr } = await admin
      .from("matches")
      .select("winner_player_id, official_score, settled_at, voided")
      .eq("id", draw.matchId)
      .single();
    if (officialErr) throw new Error(officialErr.message);
    assert.equal(official.winner_player_id, null);
    assert.equal(official.official_score, null);
    assert.equal(official.settled_at, null);
    assert.equal(official.voided, false);

    const { data: raw, error: rawErr } = await admin
      .from("platform_events")
      .select("provider_event_id")
      .in("provider_event_id", [...eventIds, staleId]);
    if (rawErr) throw new Error(rawErr.message);
    assert.equal(raw.length, 3);

    const { data: alerts, error: alertErr } = await admin
      .from("ops_events")
      .select("kind, name, payload")
      .eq("name", "listener_overlap")
      .contains("payload", { current: instanceB });
    if (alertErr) throw new Error(alertErr.message);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, "live");
    assert.equal(alerts[0].payload.previous, instanceA);
    assert.equal(alerts[0].payload.current, instanceB);
  });
});

describe("provider unavailable", () => {
  /** @type {Record<string, unknown> | null} */
  let previous = null;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin
      .from("listener_health")
      .select("*")
      .eq("id", "listener")
      .maybeSingle();
    if (error) throw new Error(error.message);
    previous = data;
  });

  after(async () => {
    if (!admin) return;
    if (previous) {
      const { error } = await admin.from("listener_health").upsert(previous, { onConflict: "id" });
      if (error) throw new Error(error.message);
      return;
    }
    await admin.from("listener_health").delete().eq("id", "listener");
  });

  it("closes the live overlay while the listener is down or stale", async () => {
    const now = new Date().toISOString();
    const { error: downErr } = await admin.from("listener_health").upsert(
      {
        id: "listener",
        transport: "rest",
        connection: "down",
        last_heartbeat_at: now,
        last_error: "provider read failed",
      },
      { onConflict: "id" }
    );
    if (downErr) throw new Error(downErr.message);
    const closed = await admin.rpc("live_overlay_open");
    if (closed.error) throw new Error(closed.error.message);
    assert.equal(closed.data, false);

    const stale = new Date(Date.now() - 91_000).toISOString();
    const { error: staleErr } = await admin.from("listener_health").upsert(
      {
        id: "listener",
        transport: "rest",
        connection: "up",
        last_heartbeat_at: stale,
        last_error: null,
      },
      { onConflict: "id" }
    );
    if (staleErr) throw new Error(staleErr.message);
    const quiet = await admin.rpc("live_overlay_open");
    if (quiet.error) throw new Error(quiet.error.message);
    assert.equal(quiet.data, false);

    const { error: upErr } = await admin.from("listener_health").upsert(
      {
        id: "listener",
        transport: "rest",
        connection: "up",
        last_heartbeat_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "id" }
    );
    if (upErr) throw new Error(upErr.message);
    const open = await admin.rpc("live_overlay_open");
    if (open.error) throw new Error(open.error.message);
    assert.equal(open.data, true);
  });
});

describe("live boundaries", { concurrency: 1 }, () => {
  const slug = "pgtap-live-i79";
  const providerEvent = "91009";
  const playerIds = ["i79a", "i79b"];
  const email = "pgtap-live-i79@example.test";
  const eventIds = ["evt-i79-missing", "evt-i79-final"];
  /** @type {{
   *   event: { id: string },
   *   matchId: string,
   *   parentId: string,
   *   sideA: string,
   *   sideB: string,
   *   publicRef: string,
   *   userId: string,
   *   bracketId: string,
   * }} */
  let draw;

  async function removeRows() {
    const { data: events } = await admin.from("tournaments").select("id").eq("slug", slug);
    const ids = (events ?? []).map((row) => row.id);
    if (ids.length) {
      await admin.from("brackets").delete().in("tournament_id", ids);
      await admin.from("league_tournaments").delete().in("tournament_id", ids);
      await admin.from("tournaments").delete().in("id", ids);
    }
    await admin.from("leagues").delete().eq("slug", slug);
    await admin.from("players").delete().in("provider_id", playerIds);
    await admin.from("platform_events").delete().in("provider_event_id", eventIds);
    await admin.from("unmapped_live_events").delete().in("provider_event_id", eventIds);
    await admin
      .from("ops_events")
      .delete()
      .eq("name", "unmapped_event")
      .contains("payload", { provider_event_id: "evt-i79-missing" });
    await admin
      .from("ops_events")
      .delete()
      .eq("name", "live_rest_disagreement")
      .contains("payload", { public_ref: `${slug}-r0-m0` });
  }

  async function officialSheet() {
    const { data: matches, error } = await admin
      .from("matches")
      .select(
        "id, round, side_a_player_id, side_b_player_id, winner_player_id, official_score, settled_at, voided"
      )
      .eq("tournament_id", draw.event.id)
      .order("round");
    if (error) throw new Error(error.message);
    const { data: seats, error: seatErr } = await admin
      .from("seats")
      .select("position, kind, player_id")
      .eq("tournament_id", draw.event.id)
      .order("position");
    if (seatErr) throw new Error(seatErr.message);
    const { data: bracket, error: bracketErr } = await admin
      .from("brackets")
      .select("points, rank, champion_player_id")
      .eq("id", draw.bracketId)
      .single();
    if (bracketErr) throw new Error(bracketErr.message);
    const { count, error: liveErr } = await admin
      .from("live_match_state")
      .select("match_id", { count: "exact", head: true })
      .eq("tournament_id", draw.event.id);
    if (liveErr) throw new Error(liveErr.message);
    return { matches, seats, bracket, liveCount: count ?? 0 };
  }

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await removeRows();
    const listed = await admin.auth.admin.listUsers();
    const stale = listed.data?.users?.find((user) => user.email === email);
    if (stale) await admin.auth.admin.deleteUser(stale.id);

    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug,
        name: "Live Boundary Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 2,
        provider_id: providerEvent,
        tier: "tour_250",
        ingestion_enabled: true,
        venue_tz: "UTC",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const people = [];
    for (const [providerId, lastName] of [
      ["i79a", "Alpha"],
      ["i79b", "Beta"],
    ]) {
      const { data, error: playerErr } = await admin
        .from("players")
        .upsert({ provider_id: providerId, last_name: lastName }, { onConflict: "provider_id" })
        .select("id")
        .single();
      if (playerErr) throw new Error(playerErr.message);
      people.push(data.id);
    }
    const { error: seatErr } = await admin.from("seats").insert([
      { tournament_id: event.id, position: 0, kind: "player", player_id: people[0] },
      { tournament_id: event.id, position: 1, kind: "player", player_id: people[1] },
    ]);
    if (seatErr) throw new Error(seatErr.message);

    const { data: first, error: firstErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 0,
        index_in_round: 0,
        side_a_player_id: people[0],
        side_b_player_id: people[1],
      })
      .select("id, external_ref")
      .single();
    if (firstErr) throw new Error(firstErr.message);
    const { data: parent, error: parentErr } = await admin
      .from("matches")
      .insert({
        tournament_id: event.id,
        round: 1,
        index_in_round: 0,
      })
      .select("id")
      .single();
    if (parentErr) throw new Error(parentErr.message);
    const { error: mapErr } = await admin.from("event_map").insert({
      tournament_id: event.id,
      match_id: first.id,
      pair_key: normalizePairKey("i79a", "i79b"),
      socket_event_id: "evt-i79-final",
      status: "mapped",
    });
    if (mapErr) throw new Error(mapErr.message);

    const created = await admin.auth.admin.createUser({
      email,
      password: "local-pgtap-only",
      email_confirm: true,
    });
    if (created.error) throw new Error(created.error.message);
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: created.data.user.id,
      display_name: "Live Fixture",
    });
    if (profileErr) throw new Error(profileErr.message);
    const { data: league, error: leagueErr } = await admin
      .from("leagues")
      .insert({
        owner_id: created.data.user.id,
        slug,
        name: "Live Boundary League",
        format: "single",
      })
      .select("id")
      .single();
    if (leagueErr) throw new Error(leagueErr.message);
    const { error: linkErr } = await admin.from("league_tournaments").insert({
      league_id: league.id,
      tournament_id: event.id,
    });
    if (linkErr) throw new Error(linkErr.message);
    const { data: bracket, error: bracketErr } = await admin
      .from("brackets")
      .insert({
        league_id: league.id,
        tournament_id: event.id,
        user_id: created.data.user.id,
        submitted_at: "2026-10-09T12:00:00.000Z",
        points: 12,
        rank: 4,
      })
      .select("id")
      .single();
    if (bracketErr) throw new Error(bracketErr.message);

    draw = {
      event,
      matchId: first.id,
      parentId: parent.id,
      sideA: people[0],
      sideB: people[1],
      publicRef: first.external_ref,
      userId: created.data.user.id,
      bracketId: bracket.id,
    };
  });

  after(async () => {
    if (!admin) return;
    await removeRows();
    if (draw?.userId) await admin.auth.admin.deleteUser(draw.userId);
  });

  it("archives an unmapped event without a live row, official result, seat, or bracket score", async () => {
    const before = await officialSheet();
    assert.equal(before.liveCount, 0);
    assert.equal(before.bracket.points, 12);
    const raw = {
      id: "evt-i79-missing",
      tourType: "atp",
      matchId: "9-8-91009-1",
      status: "InPlay",
      score: "6-0,6-0",
      player1: { name: "Alpha" },
      player2: { name: "Beta" },
      startTimestamp: 1710000000,
      receivedAt: "2026-10-09T18:05:00.000Z",
    };
    const log = [];
    const result = await acceptForwardedLive(admin, [raw], log);
    assert.equal(result.unmappedCarried, 1, log.join("\n"));

    const after = await officialSheet();
    assert.equal(after.liveCount, 0);
    assert.deepEqual(after.matches, before.matches);
    assert.deepEqual(after.seats, before.seats);
    assert.deepEqual(after.bracket, before.bracket);
    for (const row of after.matches) {
      assert.equal(row.winner_player_id, null);
      assert.equal(row.official_score, null);
    }

    const { data: archived, error: archiveErr } = await admin
      .from("platform_events")
      .select("provider_event_id, payload")
      .eq("provider_event_id", "evt-i79-missing");
    if (archiveErr) throw new Error(archiveErr.message);
    assert.equal(archived.length, 1);
    assert.equal(archived[0].payload.matchId, "9-8-91009-1");
    assert.equal(archived[0].payload.score, "6-0,6-0");

    const { data: logged, error: logErr } = await admin
      .from("ops_events")
      .select("kind, name, payload")
      .eq("name", "unmapped_event")
      .contains("payload", { provider_event_id: "evt-i79-missing" });
    if (logErr) throw new Error(logErr.message);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].kind, "live");
    assert.equal(logged[0].payload.reason, "no match");
  });

  it("stores a provisional socket final and does not set the official winner or advance a seat", async () => {
    const before = await officialSheet();
    const log = [];
    const result = await acceptForwardedLive(
      admin,
      [
        {
          source: "replay",
          seq: 9,
          replayPhase: "terminal",
          replayWinnerId: "i79a",
          id: "evt-i79-final",
          matchId: "i79a-i79b-91009-1",
          status: "InPlay",
          score: "6-4,6-2",
          receivedAt: "2026-10-09T18:00:00.000Z",
        },
      ],
      log
    );
    assert.equal(result.tournaments, 1, log.join("\n"));

    const { data: live, error } = await admin
      .from("live_match_state")
      .select("phase, score_text, provisional_winner_ref")
      .eq("match_id", draw.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    assert.equal(live.phase, "provisional_final");
    assert.equal(live.score_text, "6-4,6-2");
    assert.equal(live.provisional_winner_ref, "i79a");

    const after = await officialSheet();
    assert.deepEqual(after.matches, before.matches);
    assert.deepEqual(after.seats, before.seats);
    assert.deepEqual(after.bracket, before.bracket);
    const parent = after.matches.find((row) => row.round === 1);
    assert.equal(parent.side_a_player_id, null);
    assert.equal(parent.side_b_player_id, null);
    assert.equal(parent.winner_player_id, null);
  });

  it("fills a missing official winner and score from the REST result", async () => {
    const log = [];
    const applied = await applyMatchResults(
      admin,
      draw.event.id,
      [
        {
          match_key: "r0-m0",
          winner_ref: "i79a",
          official_score: "6-4,6-2",
          fact_kind: "played",
        },
      ],
      log
    );
    assert.equal(applied.ok, true, log.join("\n"));
    assert.equal(applied.updated, 1);
    assert.equal(applied.advanced, 1);

    const { data: official, error } = await admin
      .from("matches")
      .select("winner_player_id, official_score, settled_at, voided, fact_kind")
      .eq("id", draw.matchId)
      .single();
    if (error) throw new Error(error.message);
    assert.equal(official.winner_player_id, draw.sideA);
    assert.equal(official.official_score, "6-4,6-2");
    assert.equal(official.voided, false);
    assert.equal(official.fact_kind, "played");
    assert.ok(official.settled_at);

    const { data: parent, error: parentErr } = await admin
      .from("matches")
      .select("side_a_player_id, side_b_player_id, winner_player_id, official_score")
      .eq("id", draw.parentId)
      .single();
    if (parentErr) throw new Error(parentErr.message);
    assert.equal(parent.side_a_player_id, draw.sideA);
    assert.equal(parent.side_b_player_id, null);
    assert.equal(parent.winner_player_id, null);
    assert.equal(parent.official_score, null);

    const { data: live, error: liveErr } = await admin
      .from("live_match_state")
      .select("match_id")
      .eq("match_id", draw.matchId)
      .maybeSingle();
    if (liveErr) throw new Error(liveErr.message);
    assert.equal(live, null);

    const sheet = await officialSheet();
    assert.deepEqual(sheet.seats.map((row) => row.player_id), [draw.sideA, draw.sideB]);
    assert.equal(sheet.bracket.points, 12);
    assert.equal(sheet.bracket.champion_player_id, null);
  });

  it("keeps an existing official result when a later live frame disagrees", async () => {
    const before = await officialSheet();
    const log = [];
    const result = await acceptForwardedLive(
      admin,
      [
        {
          source: "replay",
          seq: 12,
          replayPhase: "terminal",
          replayWinnerId: "i79b",
          id: "evt-i79-final",
          matchId: "i79a-i79b-91009-1",
          status: "InPlay",
          score: "6-2,6-1",
          receivedAt: "2026-10-09T19:00:00.000Z",
        },
      ],
      log
    );
    assert.equal(result.tournaments, 1, log.join("\n"));

    const after = await officialSheet();
    assert.deepEqual(after.matches, before.matches);
    assert.deepEqual(after.seats, before.seats);
    assert.deepEqual(after.bracket, before.bracket);
    const first = after.matches.find((row) => row.round === 0);
    assert.equal(first.winner_player_id, draw.sideA);
    assert.equal(first.official_score, "6-4,6-2");
    const parent = after.matches.find((row) => row.round === 1);
    assert.equal(parent.side_a_player_id, draw.sideA);

    const { data: live, error: liveErr } = await admin
      .from("live_match_state")
      .select("match_id")
      .eq("match_id", draw.matchId)
      .maybeSingle();
    if (liveErr) throw new Error(liveErr.message);
    assert.equal(live, null);

    const { data: conflicts, error: conflictErr } = await admin
      .from("ops_events")
      .select("kind, name, payload")
      .eq("name", "live_rest_disagreement")
      .contains("payload", { public_ref: draw.publicRef });
    if (conflictErr) throw new Error(conflictErr.message);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].kind, "reconcile");
    assert.equal(conflicts[0].payload.live_score, "6-2,6-1");
    assert.equal(conflicts[0].payload.official_score, "6-4,6-2");
    assert.equal(conflicts[0].payload.live_winner_ref, "i79b");
    assert.equal(conflicts[0].payload.official_winner_ref, "i79a");
  });
});
