import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enterHref,
  leagueNewHref,
  signInNextHref,
  tournamentHref,
} from "./href.ts";

test("tournamentHref reads the ref from the tournament object", () => {
  assert.equal(tournamentHref("evt-alpha"), "/tournaments/evt-alpha");
  assert.equal(tournamentHref("evt-slam"), "/tournaments/evt-slam");
  assert.equal(tournamentHref("evt-wta"), "/tournaments/evt-wta");
});

test("tournamentHref never invents a slug", () => {
  assert.equal(tournamentHref(""), "/tournaments");
  assert.equal(tournamentHref("  "), "/tournaments");
  assert.ok(!tournamentHref("evt-alpha").includes("evt-slam"));
});

test("enterHref and leagueNewHref encode the same ref", () => {
  assert.equal(enterHref("evt-slam"), "/enter/evt-slam");
  assert.equal(
    leagueNewHref("evt-slam"),
    "/leagues/new?tournament=evt-slam"
  );
});

test("calendar href is never a sign-in URL", () => {
  assert.equal(tournamentHref("evt-1"), "/tournaments/evt-1");
  assert.ok(!tournamentHref("evt-1").includes("sign-in"));
  assert.ok(!tournamentHref("evt-slam").includes("sign-in"));
});

test("filling a bracket still gates anon through sign-in, not a saved pick", () => {
  const next = enterHref("evt-1");
  assert.equal(next, "/enter/evt-1");
  assert.equal(
    signInNextHref(next),
    "/sign-in?next=%2Fenter%2Fevt-1"
  );
});
