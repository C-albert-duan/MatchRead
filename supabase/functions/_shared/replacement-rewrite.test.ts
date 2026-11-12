// Fix list P1-2: which brackets a pre-lock replacement rewrites.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bracketsOpenForRewrite } from "./replacement-rewrite.ts";

const NOW = Date.parse("2026-11-12T12:00:00Z");

test("submitted and unsubmitted brackets are both rewritten", () => {
  const brackets = [
    { id: "draft", league_id: "L1" },
    { id: "submitted", league_id: "L1" },
  ];
  assert.deepEqual(bracketsOpenForRewrite(brackets, [], NOW), ["draft", "submitted"]);
});

test("a league the commissioner locked is left alone", () => {
  const brackets = [
    { id: "a", league_id: "locked" },
    { id: "b", league_id: "open" },
    { id: "c", league_id: null },
  ];
  const locks = [{ league_id: "locked", locked_at: "2026-11-12T11:00:00Z" }];
  assert.deepEqual(bracketsOpenForRewrite(brackets, locks, NOW), ["b", "c"]);
});

test("a future or empty league lock does not block the rewrite", () => {
  const brackets = [{ id: "a", league_id: "L1" }, { id: "b", league_id: "L2" }];
  const locks = [
    { league_id: "L1", locked_at: "2026-11-13T00:00:00Z" },
    { league_id: "L2", locked_at: null },
  ];
  assert.deepEqual(bracketsOpenForRewrite(brackets, locks, NOW), ["a", "b"]);
});
