import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalGame, canonicalSets, liveFlag, normalizeLiveMatchState } from "./normalize.ts";
import type { LiveStateDraft } from "./state.ts";

function draft(partial: Partial<LiveStateDraft> = {}): LiveStateDraft {
  return {
    matchId: "m-1",
    tournamentId: "t-1",
    publicRef: "mx-1",
    phase: "in_play",
    sets: "6-4,3-3",
    game: "40-A",
    serving: "a",
    provisionalWinner: null,
    occurredAt: "2026-10-09T14:00:01.000-04:00",
    receivedAt: "2026-10-09T18:00:02.000Z",
    ...partial,
  };
}

test("sets stay N-N text and game points stay tennis strings", () => {
  assert.equal(canonicalSets("6-4,3-3"), "6-4,3-3");
  assert.equal(canonicalSets("6-4, 3-3"), null);
  assert.equal(canonicalGame("40-A"), "40-AD");
  assert.equal(canonicalGame("AD-40"), "AD-40");
  assert.equal(canonicalGame("0-15"), "0-15");
  assert.equal(canonicalGame("15-30"), "15-30");
  assert.equal(canonicalGame("3-2"), null);
  assert.equal(canonicalGame("5-2"), null);
  assert.equal(typeof canonicalGame("40-AD"), "string");
});

test("flag comes from the live phase", () => {
  assert.equal(liveFlag("in_play"), "live");
  assert.equal(liveFlag("provisional_final"), "provisional");
  assert.equal(liveFlag("suspended"), null);
});

test("a draft becomes canonical state without provider fields", () => {
  const state = normalizeLiveMatchState(draft({ serving: "1,0" }));
  assert.ok(state);
  assert.equal(state.sets, "6-4,3-3");
  assert.equal(state.game, "40-AD");
  assert.equal(state.serving, null);
  assert.equal(state.flag, "live");
  assert.equal(state.occurredAt, "2026-10-09T18:00:01.000Z");
  assert.equal(state.receivedAt, "2026-10-09T18:00:02.000Z");
  assert.equal(Object.hasOwn(state, "winner_side"), false);
});

test("an unknown phase is not a live state", () => {
  assert.equal(normalizeLiveMatchState(draft({ phase: "terminal" })), null);
  assert.equal(normalizeLiveMatchState(draft({ phase: "InPlay" })), null);
});

test("normalization does not import a client or a fetch API", () => {
  const state = readFileSync(new URL("./state.ts", import.meta.url), "utf8");
  const normalize = readFileSync(new URL("./normalize.ts", import.meta.url), "utf8");
  for (const source of [state, normalize]) {
    assert.equal(source.includes("fetch("), false);
    assert.equal(source.includes("@supabase"), false);
    assert.equal(source.includes("updatedAt"), false);
    assert.equal(source.includes("indicator"), false);
    assert.equal(source.includes("Date.now"), false);
    assert.equal(/new Date\(\s*\)/.test(source), false);
  }
});

test("receipt is the only clock input", () => {
  const original = Date.now;
  Date.now = () => {
    throw new Error("system clock");
  };
  try {
    const state = normalizeLiveMatchState(draft());
    assert.ok(state);
    assert.equal(state.receivedAt, "2026-10-09T18:00:02.000Z");
    assert.equal(state.occurredAt, "2026-10-09T18:00:01.000Z");
  } finally {
    Date.now = original;
  }
});
