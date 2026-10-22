import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retainNovelRawEvents, rawEventRow } from "./live-archive.js";
import { liveStateRow, replayLiveFrames } from "./live-frame.js";

const frame = {
  id: "9",
  matchId: "1-2-900-1",
  score: "1-0",
  points: "15-0",
  updatedAt: 1_700_000_000_000,
  receivedAt: "2026-10-10T15:00:00.000Z",
  token: "aaa.bbb.ccc",
  side: { authorization: "Bearer ingest-secret", indicator: "A" },
};

describe("raw event archive", () => {
  it("keeps the provider row, drops secrets, and ignores receipt time", async () => {
    const row = await rawEventRow(frame);
    const again = await rawEventRow({ ...frame, receivedAt: "2026-10-10T16:00:00.000Z" });
    const changed = await rawEventRow({ ...frame, score: "2-0" });
    assert.equal(row.provider_event_id, "9");
    assert.equal(row.payload.score, "1-0");
    assert.equal(row.payload.points, "15-0");
    assert.equal(row.payload.updatedAt, 1_700_000_000_000);
    assert.equal(row.payload.matchId, "1-2-900-1");
    assert.equal(row.payload.side.indicator, "A");
    assert.equal("receivedAt" in row.payload, false);
    assert.equal("token" in row.payload, false);
    assert.equal("authorization" in row.payload.side, false);
    assert.equal(JSON.stringify(row).includes("aaa.bbb.ccc"), false);
    assert.equal(JSON.stringify(row).includes("ingest-secret"), false);
    assert.equal(again.content_hash, row.content_hash);
    assert.notEqual(changed.content_hash, row.content_hash);
  });

  it("projects a payload once and drops a later copy", async () => {
    const seen = new Set();
    const admin = {
      from(table) {
        assert.equal(table, "platform_events");
        return {
          upsert(rows, opts) {
            assert.equal(opts.onConflict, "content_hash");
            assert.equal(opts.ignoreDuplicates, true);
            const inserted = rows.filter((row) => !seen.has(row.content_hash));
            for (const row of inserted) seen.add(row.content_hash);
            return {
              select() {
                return { data: inserted.map((row) => ({ content_hash: row.content_hash })), error: null };
              },
            };
          },
        };
      },
    };
    const first = await retainNovelRawEvents(
      admin,
      [frame, { ...frame, receivedAt: "later" }, { ...frame, score: "2-0" }],
      []
    );
    assert.equal(first.length, 2);
    const second = await retainNovelRawEvents(admin, [{ ...frame, receivedAt: "again" }], []);
    assert.deepEqual(second, []);
  });

  it("replays one event twice and leaves live and official state unchanged", async () => {
    const event = {
      id: "evt-1",
      matchId: "1-2-900-1",
      status: "InPlay",
      score: "1-0",
      points: "15-0",
      updatedAt: 1_700_000_000_000,
      receivedAt: "2026-10-10T15:00:00.000Z",
    };
    const replay = JSON.parse(JSON.stringify(event));
    const seen = new Set();
    const admin = {
      from() {
        return {
          upsert(rows) {
            const inserted = rows.filter((row) => !seen.has(row.content_hash));
            for (const row of inserted) seen.add(row.content_hash);
            return {
              select() {
                return { data: inserted.map((row) => ({ content_hash: row.content_hash })), error: null };
              },
            };
          },
        };
      },
    };
    const catalog = {
      matches: [
        {
          match_id: "m-1",
          match_key: "r0-m0",
          public_ref: "mx-1",
          tournament_id: "t-1",
          tournament_provider_id: "900",
          side_a_provider_id: "1",
          side_b_provider_id: "2",
          side_a_ref: "1",
          side_b_ref: "2",
          officially_settled: false,
          official_score: null,
          winner_ref: null,
        },
      ],
      eventMap: [],
    };

    const first = await retainNovelRawEvents(admin, [event], []);
    const second = await retainNovelRawEvents(admin, [replay], []);
    assert.equal(first.length, 1);
    assert.deepEqual(second, []);

    const played = replayLiveFrames([event, replay], catalog);
    assert.equal(played.health.applied, 1);
    assert.equal(played.states.length, 1);
    assert.equal(played.states[0].score_text, "1-0");
    assert.equal(played.states[0].points_text, "15-0");
    assert.equal(played.steps[1].state, played.steps[0].state);
    assert.equal(played.steps[0].officialPatch, null);
    assert.equal(played.steps[1].officialPatch, null);
    assert.equal(played.steps[0].advance, false);
    assert.equal(played.steps[1].advance, false);
    const stored = liveStateRow(played.states[0]);
    for (const key of ["winner_player_id", "official_score", "settled_at", "voided"]) {
      assert.equal(Object.hasOwn(stored, key), false);
    }
  });
});
