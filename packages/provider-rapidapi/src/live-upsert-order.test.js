// Fix list P2-3: a row ordered by receipt time upgrades to a provider order,
// never the reverse. Mirrors migration 0050 in the store double.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLiveUpsert } from "./live-replay-harness.js";

function args(partial) {
  return {
    p_match_id: "m-1",
    p_tournament_id: "t-1",
    p_public_ref: "mx-1",
    p_phase: "in_play",
    p_score_text: "1-0",
    p_points_text: "15-0",
    p_serving_side: null,
    p_provisional_winner_ref: null,
    p_sequence: 1,
    p_sequence_source: "receivedAt",
    p_frame_key: "f1",
    p_source: "rest",
    p_received_at: "2026-11-16T10:00:00.000Z",
    p_occurred_at: null,
    ...partial,
  };
}

describe("live upsert order source", () => {
  it("lets a provider clock replace a receipt-ordered row", () => {
    const table = [];
    assert.equal(applyLiveUpsert(table, args({})), "applied");
    const next = args({
      p_sequence: 5,
      p_sequence_source: "updatedAt",
      p_occurred_at: "2026-11-16T10:00:05.000Z",
      p_frame_key: "f2",
      p_score_text: "2-0",
    });
    assert.equal(applyLiveUpsert(table, next), "applied");
    assert.equal(table[0].score_text, "2-0");
    assert.equal(table[0].sequence_source, "updatedAt");
  });

  it("does not let a receipt-ordered frame replace a provider-ordered row", () => {
    const table = [];
    applyLiveUpsert(table, args({ p_sequence: 5, p_sequence_source: "seq", p_frame_key: "f1" }));
    const older = args({ p_sequence: 9, p_sequence_source: "receivedAt", p_frame_key: "f2", p_score_text: "0-1" });
    assert.equal(applyLiveUpsert(table, older), "ignored");
    assert.equal(table[0].score_text, "1-0");
  });
});
