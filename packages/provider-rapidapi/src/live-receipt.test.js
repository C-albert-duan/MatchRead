// Fix list P0-5: live rows must carry a receipt, and a constraint error must
// not be read as "live store not deployed".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { liveStateRow, replayLiveFrames, stampReceipt } from "./live-frame.js";
import { missingLiveStore } from "./live-ingest.js";

const root = path.resolve(import.meta.dirname, "../../..");
const catalog = JSON.parse(
  readFileSync(path.join(root, "fixtures", "live-replay", "catalog.json"), "utf8")
);

// A raw row as the provider's live list returns it: no receipt of its own.
const providerRow = () => ({
  id: "evt-receipt",
  matchId: "101-202-9001-1",
  status: "InPlay",
  score: "6-4",
  points: "15-0",
  updatedAt: 1_700_000_000_000,
});

describe("stampReceipt", () => {
  it("adds receivedAt to rows that have none", () => {
    const [row] = stampReceipt([providerRow()], "2026-11-09T12:00:00.000Z");
    assert.equal(row.receivedAt, "2026-11-09T12:00:00.000Z");
    assert.equal(row.matchId, "101-202-9001-1");
  });

  it("keeps an existing receipt, in any of the receipt spellings", () => {
    const at = "2026-11-09T12:00:00.000Z";
    const [a, b, c] = stampReceipt(
      [
        { ...providerRow(), receivedAt: "2026-01-01T00:00:00.000Z" },
        { ...providerRow(), received_at: "2026-01-02T00:00:00.000Z" },
        { ...providerRow(), captured_at: "2026-01-03T00:00:00.000Z" },
      ],
      at
    );
    assert.equal(a.receivedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(b.receivedAt, "2026-01-02T00:00:00.000Z");
    assert.equal(c.receivedAt, "2026-01-03T00:00:00.000Z");
  });

  it("does not mutate its input and passes non-objects through", () => {
    const input = providerRow();
    const out = stampReceipt([input, null, "x"], "2026-11-09T12:00:00.000Z");
    assert.equal(Object.hasOwn(input, "receivedAt"), false);
    assert.deepEqual(out.slice(1), [null, "x"]);
    assert.deepEqual(stampReceipt(undefined), []);
  });
});

describe("live row receipt", () => {
  it("an unstamped provider row yields a null received_at (the P0-5 bug)", () => {
    const replay = replayLiveFrames([providerRow()], catalog);
    assert.equal(replay.states.length, 1);
    assert.equal(liveStateRow(replay.states[0]).received_at, null);
  });

  it("a stamped provider row yields a stored received_at", () => {
    const at = "2026-11-09T12:00:00.000Z";
    const replay = replayLiveFrames(stampReceipt([providerRow()], at), catalog);
    assert.equal(replay.states.length, 1);
    assert.equal(liveStateRow(replay.states[0]).received_at, at);
  });
});

describe("missingLiveStore", () => {
  it("is true only when the RPC or table is not deployed", () => {
    assert.equal(missingLiveStore({ code: "PGRST202", message: "Could not find the function" }), true);
    assert.equal(missingLiveStore({ code: "42883", message: "function does not exist" }), true);
    assert.equal(missingLiveStore({ code: "42P01", message: "relation does not exist" }), true);
  });

  it("is false for a not-null violation on live_match_state", () => {
    assert.equal(
      missingLiveStore({
        code: "23502",
        message:
          'null value in column "received_at" of relation "live_match_state" violates not-null constraint',
      }),
      false
    );
    assert.equal(missingLiveStore(null), false);
  });
});
