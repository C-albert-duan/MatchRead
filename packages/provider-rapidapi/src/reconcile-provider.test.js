import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffProviderAuthoritative,
  unboundProviderFixtures,
} from "./reconcile-provider.js";

describe("diffProviderAuthoritative", () => {
  it("flags missing stored fixtures and orphans", () => {
    const diff = diffProviderAuthoritative(
      [{ id: "1" }, { id: "2" }, { id: "3" }],
      [
        { id: "m1", provider_match_id: "1", match_key: "r0-m0" },
        { id: "m9", provider_match_id: "9", match_key: "r0-m9" },
      ]
    );
    assert.deepEqual(diff.missingFromStore.sort(), ["2", "3"]);
    assert.equal(diff.orphans.length, 1);
    assert.equal(diff.orphans[0].provider_match_id, "9");
  });
});

describe("unboundProviderFixtures", () => {
  it("lists provider rows not bound and not already known", () => {
    const unbound = unboundProviderFixtures(
      [
        { id: "a", match_winner: "1", player1Id: "1", player2Id: "2" },
        { id: "b", match_winner: "3", player1Id: "3", player2Id: "4" },
        { id: "c", match_winner: null, player1Id: "5", player2Id: "6" },
      ],
      [{ match_key: "r0-m0", provider_match_id: "a" }],
      new Set(["c"])
    );
    assert.equal(unbound.length, 1);
    assert.equal(unbound[0].provider_match_id, "b");
    assert.equal(unbound[0].has_winner, true);
  });
});
