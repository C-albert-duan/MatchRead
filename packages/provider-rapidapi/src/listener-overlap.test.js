import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LISTENER_OVERLAP_MS, listenerOverlap } from "./listener-overlap.js";

const now = Date.parse("2026-10-10T12:00:00.000Z");

describe("listener overlap", () => {
  it("keeps one instance quiet", () => {
    const decision = listenerOverlap(
      { instanceId: "replica-a", seenAt: new Date(now - 1000).toISOString() },
      "replica-a",
      now
    );
    assert.equal(decision.overlap, false);
    assert.equal(decision.warning, null);
    assert.equal(decision.instanceId, "replica-a");
  });

  it("warns when a second instance is still recent and does not drop the batch", () => {
    const decision = listenerOverlap(
      { instanceId: "replica-a", seenAt: new Date(now - 1000).toISOString() },
      "replica-b",
      now
    );
    assert.equal(decision.overlap, true);
    assert.equal(decision.instanceId, "replica-b");
    assert.equal(decision.warning?.name, "listener_overlap");
    assert.deepEqual(decision.warning?.payload, { previous: "replica-a", current: "replica-b" });
    assert.equal("skip" in decision, false);
  });

  it("treats a later replacement as one process", () => {
    const decision = listenerOverlap(
      { instanceId: "replica-a", seenAt: new Date(now - LISTENER_OVERLAP_MS - 1).toISOString() },
      "replica-b",
      now
    );
    assert.equal(decision.overlap, false);
    assert.equal(decision.instanceId, "replica-b");
  });

  it("ignores a missing id", () => {
    assert.deepEqual(listenerOverlap({ instanceId: "replica-a", seenAt: new Date(now).toISOString() }, "  ", now), {
      overlap: false,
      instanceId: null,
      warning: null,
    });
  });
});
