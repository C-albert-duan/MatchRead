import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { OfficialResults } from "../../../../packages/core/src/grade.ts";
import { buildViewerNodes } from "../brackets/viewer-tree.ts";
import type { MatchScheduleRow } from "../tournaments/format.ts";
import { LIVE_LAYER_STALE_MS, liveLayerOpen, liveSnapshotOpen } from "./provider-down.ts";

const now = Date.parse("2026-10-10T18:00:00.000Z");

test("a down or quiet listener closes the live overlay", () => {
  const fresh = new Date(now - 1_000).toISOString();
  assert.equal(liveLayerOpen({ connection: "up", lastHeartbeatAt: fresh }, now), true);
  assert.equal(liveLayerOpen({ connection: "down", lastHeartbeatAt: fresh }, now), false);
  assert.equal(liveLayerOpen(null, now), false);
  assert.equal(liveLayerOpen({ connection: "up", lastHeartbeatAt: null }, now), false);
  assert.equal(
    liveLayerOpen(
      { connection: "up", lastHeartbeatAt: new Date(now - LIVE_LAYER_STALE_MS - 1).toISOString() },
      now
    ),
    false
  );
  assert.equal(liveSnapshotOpen({ live: false, matches: [{ public_ref: "fx-1" }] }), false);
  assert.equal(liveSnapshotOpen({ live: true, matches: [] }), true);
  assert.equal(liveSnapshotOpen(null), false);
});

test("the official sheet stands with no live overlay", () => {
  const official: OfficialResults = {
    "r0-m0": {
      winnerRef: "p-0",
      voided: false,
      officialScore: "6-4 6-2",
      factKind: "played",
    },
  };
  const schedule: Record<string, MatchScheduleRow> = {
    "r0-m0": {
      scheduled_at: "2026-10-10T14:00:00.000Z",
      has_time: true,
      external_ref: "fx-r0-m0",
    },
    "r0-m1": {
      scheduled_at: null,
      has_time: false,
      external_ref: "fx-r0-m1",
    },
    "r1-m0": {
      scheduled_at: null,
      has_time: false,
      external_ref: "fx-r1-m0",
    },
  };
  const seats = [0, 1, 2, 3].map((position) => ({
    position,
    kind: "player" as const,
    player_id: `p-${position}`,
    last_name: `S${position}`,
    seed: null,
    country_code: "XXX",
  }));
  const nodes = buildViewerNodes(4, seats, official, schedule);
  assert.equal(nodes[0]?.state, "official");
  assert.equal(nodes[0]?.score, "6-4 6-2");
  assert.equal(nodes[1]?.state, "scheduled");
  assert.equal(nodes[1]?.score, null);
  assert.equal(nodes.some((node) => node.state === "live" || node.state === "provisional"), false);
});

test("public pages do not read the listener", () => {
  const app = path.resolve(import.meta.dirname, "../../app");
  const readModel = readFileSync(path.resolve(import.meta.dirname, "../brackets/read-model.ts"), "utf8");
  const tournamentPage = readFileSync(path.join(app, "tournaments", "[ref]", "page.tsx"), "utf8");
  const matchPage = readFileSync(path.join(app, "matches", "[ref]", "page.tsx"), "utf8");
  for (const source of [readModel, tournamentPage, matchPage]) {
    assert.equal(source.includes("listener_health"), false);
    assert.equal(source.includes("live_overlay_open"), false);
    assert.equal(source.includes("provider-rapidapi"), false);
    assert.equal(source.includes("live_match_state"), false);
  }
});
