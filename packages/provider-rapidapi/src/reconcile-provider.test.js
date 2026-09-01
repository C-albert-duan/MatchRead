import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffProviderAuthoritative,
  unboundProviderFixtures,
  r0SlotFromSeatPair,
  proposeShapeBRepairs,
} from "./reconcile-provider.js";
import { outcomeDisposition } from "./normalize.js";

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

describe("outcomeDisposition", () => {
  it("maps exceptional outcomes", () => {
    assert.equal(outcomeDisposition("retired").kind, "settle");
    assert.equal(outcomeDisposition("walkover").advances, true);
    assert.equal(outcomeDisposition("cancelled").voided, true);
    assert.equal(outcomeDisposition("suspended").kind, "skip");
    assert.equal(outcomeDisposition("mystery").kind, "unknown");
  });
});

describe("r0SlotFromSeatPair / proposeShapeBRepairs", () => {
  it("maps adjacent official seats to R0", () => {
    const slot = r0SlotFromSeatPair(
      [
        { position: 0, provider_player_id: "10" },
        { position: 1, provider_player_id: "20" },
        { position: 2, provider_player_id: "30" },
        { position: 3, provider_player_id: "40" },
      ],
      "20",
      "10"
    );
    assert.deepEqual(slot, {
      round: 0,
      index_in_round: 0,
      match_key: "r0-m0",
      side_a_provider_id: "10",
      side_b_provider_id: "20",
    });
  });

  it("proposes create when match missing", () => {
    const repairs = proposeShapeBRepairs(
      [
        {
          provider_match_id: "fx-1",
          has_winner: true,
          player1Id: "10",
          player2Id: "20",
          match_winner: "10",
          result_type: "completed",
        },
      ],
      [
        { position: 0, provider_player_id: "10" },
        { position: 1, provider_player_id: "20" },
      ],
      []
    );
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].action, "create");
    assert.equal(repairs[0].match_key, "r0-m0");
  });

  it("proposes fill when existing sides disagree with official seats", () => {
    const repairs = proposeShapeBRepairs(
      [
        {
          provider_match_id: "fx-heal",
          has_winner: true,
          player1Id: "10",
          player2Id: "20",
          match_winner: "10",
          result_type: "completed",
        },
      ],
      [
        { position: 0, provider_player_id: "10" },
        { position: 1, provider_player_id: "20" },
      ],
      [
        {
          match_key: "r0-m0",
          round: 0,
          index_in_round: 0,
          provider_match_id: "stale",
          side_a_provider_id: "99",
          side_b_provider_id: "88",
        },
      ]
    );
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].action, "fill");
    assert.equal(repairs[0].side_a_provider_id, "10");
    assert.equal(repairs[0].side_b_provider_id, "20");
  });

  it("rejects non-adjacent pairs", () => {
    assert.equal(
      r0SlotFromSeatPair(
        [
          { position: 0, provider_player_id: "10" },
          { position: 2, provider_player_id: "20" },
        ],
        "10",
        "20"
      ),
      null
    );
  });
});
