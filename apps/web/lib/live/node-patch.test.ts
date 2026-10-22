import assert from "node:assert/strict";
import { test } from "node:test";
import { liveNodePatch, patchAffectedNodes } from "./node-patch.ts";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";

test("a live patch is addressed by the public match ref", () => {
  const patch = liveNodePatch({
    match_id: MATCH_ID,
    tournament_id: "22222222-2222-4222-8222-222222222222",
    public_ref: "fx-1",
    phase: "in_play",
    score_text: "6-4",
    points_text: "15-0",
    serving_side: "a",
    provisional_winner_ref: null,
    sequence: 3,
    sequence_source: "seq",
    received_at: "2026-10-10T15:00:00.000Z",
    occurred_at: "2026-10-10T14:59:00.000Z",
  });
  assert.equal(patch?.public_ref, "fx-1");
  assert.equal(patch?.score_text, "6-4");
  assert.equal(patch?.sequence, 3);
  const json = JSON.stringify(patch);
  assert.equal(json.includes(MATCH_ID), false);
  assert.equal(json.includes("22222222"), false);
  assert.equal(json.includes("match_id"), false);
  assert.equal(json.includes("tournament_id"), false);
});

test("a row that only has a match id is not a node patch", () => {
  assert.equal(
    liveNodePatch({
      match_id: MATCH_ID,
      phase: "in_play",
      score_text: "6-0",
      received_at: "2026-10-10T15:00:00.000Z",
    }),
    null
  );
  assert.equal(
    liveNodePatch({
      public_ref: MATCH_ID,
      phase: "in_play",
      received_at: "2026-10-10T15:00:00.000Z",
    }),
    null
  );
  assert.equal(
    liveNodePatch({
      public_ref: "9001",
      phase: "in_play",
      received_at: "2026-10-10T15:00:00.000Z",
    }),
    null
  );
});

test("a score update patches the matching node and leaves the rest of the tree", () => {
  const tree = [
    { publicRef: "fx-1", score: "0-0" },
    { publicRef: "fx-2", score: "" },
    { publicRef: "fx-3", score: "1-1" },
  ];
  const next = patchAffectedNodes(tree, "fx-2", (node) => ({ ...node, score: "6-4" }));
  assert.equal(next.length, tree.length);
  assert.equal(next[0], tree[0]);
  assert.equal(next[2], tree[2]);
  assert.notEqual(next[1], tree[1]);
  assert.equal(next[1]?.score, "6-4");
  assert.equal(tree[1]?.score, "");

  const missed = patchAffectedNodes(tree, "fx-9", (node) => ({ ...node, score: "6-0" }));
  assert.equal(missed, tree);

  const byId = patchAffectedNodes(tree, MATCH_ID, (node) => ({ ...node, score: "6-0" }));
  assert.equal(byId, tree);
});
