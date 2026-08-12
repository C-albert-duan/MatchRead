import assert from "node:assert/strict";
import { test } from "node:test";
import { enterHref, leagueNewHref, tournamentHref } from "./href.ts";

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
