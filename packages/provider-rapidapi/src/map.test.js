import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapResultsToIngest } from "./index.js";

describe("mapResultsToIngest", () => {
  const mapping = {
    tournament_id: "00000000-0000-0000-0000-000000000001",
    provider_tournament_id: "21346",
    players: { "28170": "p-0", "29939": "p-1" },
    matches: { "1244910": "r0-m0", "999": "r0-m1" },
  };

  it("maps winner via match_winner", () => {
    const { results, skipped } = mapResultsToIngest(
      [
        {
          id: "1244910",
          match_winner: 28170,
          result: "6-2 2-0 ret.",
          result_type: "retired",
        },
      ],
      mapping
    );
    assert.equal(skipped.length, 0);
    assert.deepEqual(results, [
      { match_key: "r0-m0", winner_ref: "p-0", voided: false },
    ]);
  });

  it("skips unmapped match ids", () => {
    const { results, skipped } = mapResultsToIngest(
      [{ id: "nope", match_winner: 28170, result_type: "completed" }],
      mapping
    );
    assert.equal(results.length, 0);
    assert.equal(skipped[0].reason, "no match_key mapping");
  });

  it("voids walkover without winner", () => {
    const { results, skipped } = mapResultsToIngest(
      [{ id: "999", match_winner: null, result_type: "walkover", result: "" }],
      mapping
    );
    assert.equal(skipped.length, 0);
    assert.deepEqual(results[0], {
      match_key: "r0-m1",
      winner_ref: null,
      voided: true,
    });
  });
});
