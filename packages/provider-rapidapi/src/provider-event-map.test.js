import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { liveRowsFromNdjson } from "./live-frame.js";
import { planProviderEventMap } from "./provider-event-map.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function match(id, tour, tournament, a, b) {
  return {
    match_id: id,
    tour,
    tournament_provider_id: tournament,
    side_a_provider_id: a,
    side_b_provider_id: b,
  };
}

describe("provider event backfill", () => {
  it("maps a live id by tour, tournament segment, and player ids", () => {
    const plan = planProviderEventMap(
      [
        {
          id: "live-1",
          tourType: "wta",
          matchId: "11-22-900-1",
          player1: { name: "One" },
          player2: { name: "Two" },
        },
      ],
      [match("m-1", "wta", "900", "22", "11")]
    );
    assert.deepEqual(plan.rows, [
      { tour: "wta", provider_event_id: "live-1", match_id: "m-1" },
    ]);
  });

  it("does not use a fixture id or a display name", () => {
    const named = planProviderEventMap(
      [
        {
          id: "live-9",
          tourType: "atp",
          matchId: "1-2-3-4",
          player1: { name: "Alpha" },
          player2: { name: "Beta" },
        },
      ],
      [match("m-1", "atp", "3", "9", "8")]
    );
    const renamed = planProviderEventMap(
      [
        {
          id: "live-9",
          tourType: "atp",
          matchId: "1-2-3-4",
          player1: { name: "Other" },
          player2: { name: "Person" },
        },
      ],
      [match("m-1", "atp", "3", "9", "8")]
    );
    assert.equal(named.rows.length, 0);
    assert.equal(named.unmapped.not_found, 1);
    assert.deepEqual(named, renamed);
  });

  it("leaves a pair that hits two matches unmapped", () => {
    const plan = planProviderEventMap(
      [{ id: "live-2", tourType: "atp", matchId: "4-5-6-1" }],
      [match("m-1", "atp", "6", "4", "5"), match("m-2", "atp", "6", "5", "4")]
    );
    assert.equal(plan.rows.length, 0);
    assert.equal(plan.unmapped.ambiguous_match, 1);
  });

  it("does not let one live id point at two matches", () => {
    const plan = planProviderEventMap(
      [
        { id: "live-3", tourType: "atp", matchId: "1-2-10-1" },
        { id: "live-3", tourType: "atp", matchId: "3-4-10-1" },
      ],
      [match("m-1", "atp", "10", "1", "2"), match("m-2", "atp", "10", "3", "4")]
    );
    assert.equal(plan.rows.length, 0);
    assert.equal(plan.unmapped.ambiguous_event, 1);
  });

  it("keeps the same live id on two tours", () => {
    const plan = planProviderEventMap(
      [
        { id: "live-4", tourType: "atp", matchId: "1-2-10-1" },
        { id: "live-4", tourType: "wta", matchId: "1-2-10-1" },
      ],
      [match("m-a", "atp", "10", "1", "2"), match("m-w", "wta", "10", "2", "1")]
    );
    assert.equal(plan.rows.length, 2);
  });

  it("does not treat stored fixture ids as the live id", () => {
    const files = [
      resolve(root, "captures/live-raw.ndjson"),
      resolve(root, "fixtures/live-capture-oct-2026/frames.ndjson"),
    ].filter((path) => existsSync(path));
    if (!files.length) return;

    const fixtureIds = new Set();
    const liveRows = [];
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      liveRows.push(...liveRowsFromNdjson(text));
      for (const line of text.split(/\n/)) {
        if (!line.trim()) continue;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          continue;
        }
        const body = record.body_text || record.payload;
        if (typeof body !== "string" || !String(record.path || "").includes("fixtures")) continue;
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          continue;
        }
        for (const row of parsed.data ?? []) {
          if (row?.id != null) fixtureIds.add(String(row.id));
          if (row?.matchId != null) fixtureIds.add(String(row.matchId));
        }
      }
    }

    const matches = [];
    let n = 0;
    for (const row of liveRows) {
      const parts = String(row.matchId || "").split("-");
      if (parts.length < 4 || (row.tourType !== "atp" && row.tourType !== "wta")) continue;
      n += 1;
      matches.push(match(`m-${n}`, row.tourType, parts[2], parts[0], parts[1]));
    }
    const plan = planProviderEventMap(liveRows, matches);
    assert.ok(plan.rows.length > 0);
    if (fixtureIds.size === 0) return;
    for (const row of plan.rows) {
      assert.equal(fixtureIds.has(row.provider_event_id), false);
    }
  });
});
