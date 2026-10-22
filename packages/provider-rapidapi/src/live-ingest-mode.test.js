import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveIngestRequest } from "./live-ingest-mode.js";

describe("live ingest mode", () => {
  it("treats mode live and a liveFrames array as the same branch", () => {
    const frames = [{ matchId: "1-2-900-1" }];
    assert.deepEqual(liveIngestRequest({ mode: "live", liveFrames: frames }), {
      live: true,
      frames,
    });
    assert.deepEqual(liveIngestRequest({ liveFrames: frames }), { live: true, frames });
    assert.deepEqual(liveIngestRequest({ year: 2026 }), { live: false });
  });

  it("rejects another mode and a live mode with no frames", () => {
    assert.equal(liveIngestRequest({ mode: "reconcile" }).error, "mode is not live");
    assert.equal(liveIngestRequest({ mode: "live" }).error, "live mode requires liveFrames");
    assert.equal(
      liveIngestRequest({ mode: "live", liveFrames: [null] }).error,
      "liveFrames must be objects"
    );
  });
});
