import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDraw,
  countSeeds,
  nonMainDrawKind,
} from "./official/classify-draw.js";

describe("classifyDraw", () => {
  it("rejects explicit qualifying path", () => {
    const c = classifyDraw({
      pathHint: "qualifying",
      size: 128,
      expectedSize: 128,
      seedCount: 32,
    });
    assert.equal(c.kind, "rejected");
    if (c.kind === "rejected") assert.equal(c.reason, "qualifying");
  });

  it("rejects zero seeds on a 128 field (US Open qualifying signature)", () => {
    const c = classifyDraw({
      size: 128,
      expectedSize: 128,
      seedCount: 0,
    });
    assert.equal(c.kind, "rejected");
    if (c.kind === "rejected") assert.equal(c.reason, "no_seeds");
  });

  it("rejects slam sheet that ends in 16 matches", () => {
    const c = classifyDraw({
      size: 128,
      expectedSize: 128,
      seedCount: 16,
      terminalRoundMatches: 16,
    });
    assert.equal(c.kind, "rejected");
    if (c.kind === "rejected") assert.equal(c.reason, "qualifying");
  });

  it("accepts a seeded slam main sheet", () => {
    const c = classifyDraw({
      pathHint: "singles",
      size: 128,
      expectedSize: 128,
      seedCount: 32,
      terminalRoundMatches: 1,
    });
    assert.deepEqual(c, { kind: "main_singles", size: 128 });
  });

  it("does not use size alone to accept", () => {
    assert.equal(nonMainDrawKind("qualifyingSingles"), "qualifying");
    assert.equal(nonMainDrawKind("singles"), null);
  });

  it("counts seeds from seats", () => {
    assert.equal(
      countSeeds([
        { kind: "player", seed: 1 },
        { kind: "player", seed: null },
        { kind: "bye", seed: null },
        { kind: "player", seed: 8 },
      ]),
      2
    );
  });
});
