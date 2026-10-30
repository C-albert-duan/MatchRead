import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reasonsFor } from "./consequence.ts";
import { swingsFirstPlace, type SwingMember } from "./swing.ts";

const firstRound = { matchKey: "r0-m0", sideARef: "pA", sideBRef: "pB" };
const final16 = { matchKey: "r3-m0", sideARef: "pA", sideBRef: "pB" };

function member(memberId: string, points: number, pick: string | null, key = "r0-m0"): SwingMember {
  return { memberId, points, picks: pick ? { [key]: pick } : {} };
}

describe("league swing", () => {
  it("swings when the trailing member's pick would take first place", () => {
    // A first-round win adds 1. Leader on 10 picked pB; chaser on 10 picked pA.
    const members = [member("u1", 10, "pB"), member("u2", 10, "pA")];
    assert.equal(swingsFirstPlace(16, members, firstRound), true);
  });

  it("does not swing when the leader stays first either way", () => {
    const members = [member("u1", 12, "pB"), member("u2", 10, "pA")];
    assert.equal(swingsFirstPlace(16, members, firstRound), false);
  });

  it("does not swing when both members picked the same player", () => {
    const members = [member("u1", 10, "pA"), member("u2", 10, "pA")];
    assert.equal(swingsFirstPlace(16, members, firstRound), false);
  });

  it("counts a shared first place breaking into a sole leader as a swing", () => {
    // pA: u2 reaches 11 and ties u1 on 11. pB: u1 stays alone on 11.
    const members = [member("u1", 11, "pB"), member("u2", 10, "pA")];
    assert.equal(swingsFirstPlace(16, members, firstRound), true);
  });

  it("adds the champion bonus on the final", () => {
    // Final of a 16-draw: 8 for the match plus 8 champion bonus. A 15-point gap closes.
    const members = [member("u1", 25, "pB", "r3-m0"), member("u2", 10, "pA", "r3-m0")];
    assert.equal(swingsFirstPlace(16, members, final16), true);
    const wider = [member("u1", 27, "pB", "r3-m0"), member("u2", 10, "pA", "r3-m0")];
    assert.equal(swingsFirstPlace(16, wider, final16), false);
  });

  it("never swings with one member, an open side, or a key outside the draw", () => {
    assert.equal(swingsFirstPlace(16, [member("u1", 0, "pA")], firstRound), false);
    const members = [member("u1", 10, "pB"), member("u2", 10, "pA")];
    assert.equal(swingsFirstPlace(16, members, { ...firstRound, sideBRef: null }), false);
    assert.equal(swingsFirstPlace(16, members, { ...firstRound, matchKey: "r9-m0" }), false);
  });

  it("is a reason only on a match that is not final", () => {
    const base = {
      matchKey: "r0-m0",
      sideARef: "pA",
      sideBRef: "pB",
      winnerRef: null,
      leader: null,
      pointFlags: null,
      swing: true,
    };
    const ctx = { drawSize: 16, picks: {}, eliminated: new Set<string>() };
    assert.deepEqual(reasonsFor({ ...base, status: "scheduled" }, ctx), [
      { prio: 3, kind: "swing", params: {} },
    ]);
    assert.deepEqual(reasonsFor({ ...base, status: "final", winnerRef: "pA" }, ctx), []);
    assert.deepEqual(reasonsFor({ ...base, status: "live", swing: false }, ctx), []);
  });
});
