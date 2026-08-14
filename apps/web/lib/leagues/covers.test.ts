import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leagueIncludesTournament } from "./covers.ts";

describe("leagueIncludesTournament", () => {
  const atp = "atp-id";
  const wta = "wta-id";

  it("season leagues include every tournament", () => {
    assert.equal(
      leagueIncludesTournament({ format: "season", tournament_id: null }, atp),
      true
    );
    assert.equal(
      leagueIncludesTournament({ format: "season", tournament_id: null }, wta),
      true
    );
  });

  it("single leagues include only their tournament id", () => {
    const league = { format: "single", tournament_id: wta };
    assert.equal(leagueIncludesTournament(league, wta), true);
    assert.equal(leagueIncludesTournament(league, atp), false);
  });

  it("unbound single leagues include none", () => {
    assert.equal(
      leagueIncludesTournament({ format: "single", tournament_id: null }, wta),
      false
    );
  });
});
