import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enterHref,
  leagueNewHref,
  signInNextHref,
  tournamentHref,
} from "./href.ts";

test("tournamentHref reads the ref from the tournament object", () => {
  assert.equal(tournamentHref("nbo-mtl-2026"), "/tournaments/nbo-mtl-2026");
  assert.equal(tournamentHref("uso-2026"), "/tournaments/uso-2026");
  assert.equal(tournamentHref("cin-wta-2026"), "/tournaments/cin-wta-2026");
});

test("tournamentHref never invents a slug", () => {
  assert.equal(tournamentHref(""), "/tournaments");
  assert.equal(tournamentHref("  "), "/tournaments");
  assert.ok(!tournamentHref("nbo-mtl-2026").includes("uso-2026"));
});

test("enterHref and leagueNewHref encode the same ref", () => {
  assert.equal(enterHref("uso-2026"), "/enter/uso-2026");
  assert.equal(
    leagueNewHref("uso-2026"),
    "/leagues/new?tournament=uso-2026"
  );
});

test("calendar href is never a sign-in URL", () => {
  assert.equal(tournamentHref("cin-2026"), "/tournaments/cin-2026");
  assert.ok(!tournamentHref("cin-2026").includes("sign-in"));
  assert.ok(!tournamentHref("uso-2026").includes("sign-in"));
});

test("filling a bracket still gates anon through sign-in, not a saved pick", () => {
  const next = enterHref("cin-2026");
  assert.equal(next, "/enter/cin-2026");
  assert.equal(
    signInNextHref(next),
    "/sign-in?next=%2Fenter%2Fcin-2026"
  );
});
