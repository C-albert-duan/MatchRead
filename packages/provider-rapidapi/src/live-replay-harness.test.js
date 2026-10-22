/**
 * Replay harness. Prototype and M1 captures go through acceptForwardedLive.
 * Pure unit tests of normalizeLiveMatchState stay in packages/core.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { normalizeLiveMatchState } from "../../core/src/live/normalize.ts";
import { deriveLiveFlags, liveRowsFromNdjson } from "./live-frame.js";
import { walkReplayClock } from "./live-replay-clock.js";
import {
  M1_CAPTURE_FILES,
  PROTOTYPE_TIMELINE,
  catalogCoversFrames,
  createReplayAdmin,
  liveRows,
  m1CaptureSkip,
  readReplayFrames,
  replayThroughIngest,
  seedCapturedPairs,
  seedReplayCatalog,
} from "./live-replay-harness.js";

const root = path.resolve(import.meta.dirname, "../../..");
const OFFICIAL = [
  "winner_player_id",
  "winner_side",
  "official_score",
  "settled_at",
  "voided",
];

function prototypeFrames() {
  return readReplayFrames(path.join(root, PROTOTYPE_TIMELINE));
}

function assertCoreRow(row) {
  const state = normalizeLiveMatchState({
    matchId: row.match_id,
    tournamentId: row.tournament_id,
    publicRef: row.public_ref,
    phase: row.phase,
    sets: row.score_text,
    game: row.points_text,
    serving: row.serving_side,
    provisionalWinner: row.provisional_winner_ref,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
  });
  assert.ok(state);
  assert.equal(state.sets, row.score_text);
  assert.equal(state.game, row.points_text);
  assert.equal(state.flag, row.flag);
  assert.equal(state.phase, row.phase);
  assert.equal(state.serving, row.serving_side);
  assert.equal(state.provisionalWinner, row.provisional_winner_ref);
  assert.equal(state.occurredAt, row.occurred_at);
  for (const key of OFFICIAL) assert.equal(Object.hasOwn(row, key), false, key);
}

async function replaySeeded(frames, seed) {
  const admin = createReplayAdmin();
  seed(admin, frames);
  const log = [];
  const result = await replayThroughIngest(admin, frames, log);
  return { admin, result, log };
}

describe("replay harness", () => {
  it("uses the production ingest entry", () => {
    const source = readFileSync(new URL("./live-replay-harness.js", import.meta.url), "utf8");
    const clock = readFileSync(new URL("./live-replay-clock.js", import.meta.url), "utf8");
    assert.equal(source.includes("acceptForwardedLive"), true);
    assert.equal(source.includes("replayLiveFrames"), false);
    assert.equal(source.includes("Date.now"), false);
    assert.equal(source.includes("setTimeout"), false);
    assert.equal(clock.includes("Date.now"), false);
    assert.equal(clock.includes("setTimeout"), false);
    for (const name of ["settleAll", "apply_grades", "apply_bracket_state", "winner_side"]) {
      assert.equal(source.includes(name), false, name);
    }
  });

  it("keeps the prototype timeline aligned with the NDJSON fixture", () => {
    const json = prototypeFrames();
    const ndjson = liveRowsFromNdjson(
      readFileSync(path.join(root, "fixtures", "live-replay", "TIMELINE.ndjson"), "utf8")
    );
    assert.deepEqual(json, ndjson);
  });

  it("replays the prototype timeline into one live row", async () => {
    const frames = prototypeFrames();
    const catalog = JSON.parse(
      readFileSync(path.join(root, "fixtures", "live-replay", "catalog.json"), "utf8")
    );
    assert.equal(catalogCoversFrames(catalog, frames), true);
    const once = await replaySeeded(frames, (admin) => seedReplayCatalog(admin, catalog));
    const twice = await replaySeeded(frames, (admin) => seedReplayCatalog(admin, catalog));
    assert.deepEqual(liveRows(once.admin), liveRows(twice.admin));
    assert.equal(once.result.tournaments, 1);
    assert.equal(once.result.unmappedCarried, 0);
    assert.equal(once.result.sleptMs, 0);
    assert.equal(once.result.now, "2026-10-09T15:40:00.000Z");
    assert.equal(once.admin.tables.listener_health[0].updated_at, "2026-10-09T15:40:00.000Z");
    assert.equal(liveRows(once.admin).length, 1);
    const row = liveRows(once.admin)[0];
    assert.equal(row.match_id, "m-1");
    assert.equal(row.tournament_id, "t-1");
    assert.equal(row.public_ref, "mx-1");
    assert.equal(row.phase, "provisional_final");
    assert.equal(row.score_text, "6-4,6-2");
    assert.equal(row.points_text, null);
    assert.equal(row.serving_side, null);
    assert.equal(row.provisional_winner_ref, "101");
    assert.equal(row.flag, "provisional");
    assert.equal(row.sequence, 5);
    assert.equal(row.sequence_source, "seq");
    assert.equal(row.source, "replay");
    assert.equal(row.occurred_at, null);
    assert.equal(row.received_at, "2026-10-09T15:40:00.000Z");
    assert.equal(row.stats, null);
    assertCoreRow(row);
    const match = once.admin.tables.matches[0];
    assert.equal(match.winner_player_id ?? null, null);
    assert.equal(match.settled_at, null);
    assert.equal(match.official_score, null);

    const storedEvents = once.admin.tables.platform_events.length;
    const again = await replayThroughIngest(once.admin, frames, []);
    assert.equal(again.tournaments, 0);
    assert.equal(once.admin.tables.platform_events.length, storedEvents);
    assert.deepEqual(liveRows(once.admin), [row]);
  });

  it("replays an eleven-hour timeline on the virtual clock", async () => {
    const elevenHours = 11 * 60 * 60 * 1000;
    const base = prototypeFrames();
    const start = Date.parse(base[0].receivedAt);
    const end = new Date(start + elevenHours).toISOString();
    const frames = base.map((frame, index) =>
      index === base.length - 1 ? { ...frame, receivedAt: end } : frame
    );
    const clock = walkReplayClock(frames);
    assert.equal(clock.spanMs, elevenHours);
    assert.equal(clock.sleptMs, 0);
    assert.equal(clock.iso, end);
    const catalog = JSON.parse(
      readFileSync(path.join(root, "fixtures", "live-replay", "catalog.json"), "utf8")
    );
    const started = Date.now();
    const played = await replaySeeded(frames, (admin) => seedReplayCatalog(admin, catalog));
    assert.ok(Date.now() - started < 2_000);
    assert.equal(played.result.sleptMs, 0);
    assert.equal(played.result.now, end);
    assert.equal(played.admin.tables.listener_health[0].updated_at, end);
    const row = liveRows(played.admin)[0];
    assert.equal(row.received_at, end);
    assert.equal(row.score_text, "6-4,6-2");
    assert.equal(row.phase, "provisional_final");
    const atEvent = deriveLiveFlags(
      { phase: "in_play", received_at: base[0].receivedAt },
      start
    );
    const atEnd = deriveLiveFlags(
      { phase: "in_play", received_at: base[0].receivedAt },
      start + elevenHours
    );
    assert.equal(atEvent.stale, false);
    assert.equal(atEnd.stale, true);
    assert.equal(played.admin.tables.matches[0].settled_at, null);
  });

  it("replays each M1 capture to the same live rows", { skip: m1CaptureSkip(root) }, async () => {
    for (const rel of M1_CAPTURE_FILES) {
      const file = path.join(root, rel);
      assert.equal(existsSync(file), true, file);
      const frames = readReplayFrames(file);
      assert.ok(frames.length > 0, rel);
      const tours = new Set(frames.map((row) => row.tourType));
      assert.equal(tours.has("atp"), true, rel);
      assert.equal(tours.has("wta"), true, rel);
      const once = await replaySeeded(frames, seedCapturedPairs);
      const twice = await replaySeeded(frames, seedCapturedPairs);
      const rows = liveRows(once.admin);
      assert.deepEqual(rows, liveRows(twice.admin));
      assert.ok(rows.length > 0, rel);
      assert.equal(once.result.unmappedCarried, 0, rel);
      for (const row of rows) {
        assert.equal(row.phase, "in_play", rel);
        assert.equal(row.flag, "live", rel);
        assert.equal(row.serving_side, null, rel);
        assert.equal(row.provisional_winner_ref, null, rel);
        assert.equal(row.stats, null, rel);
        assert.equal(row.source, "rest", rel);
        assertCoreRow(row);
      }
      for (const match of once.admin.tables.matches) {
        assert.equal(match.winner_player_id ?? null, null);
        assert.equal(match.settled_at, null);
      }
      const before = liveRows(once.admin);
      const storedEvents = once.admin.tables.platform_events.length;
      const again = await replayThroughIngest(once.admin, frames, []);
      assert.equal(again.tournaments, 0, rel);
      assert.equal(once.admin.tables.platform_events.length, storedEvents, rel);
      assert.deepEqual(liveRows(once.admin), before);
    }
  });
});
