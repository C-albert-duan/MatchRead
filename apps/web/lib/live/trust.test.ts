import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveProjectionExcludesOfficial, type LiveDecision } from "./trust.ts";

describe("live type boundary", () => {
  it("keeps official columns off the live projection", () => {
    assert.equal(liveProjectionExcludesOfficial, true);
    const decision: LiveDecision = { officialPatch: null, advance: false };
    assert.equal(decision.officialPatch, null);
    assert.equal(decision.advance, false);
  });
});
