/**
 * Regression for check/V3-M4-DOD.md F-1: a snapshot refetch must not leave a
 * cell older than the database.
 *
 * Seen in the browser: a foreground refetch was in flight when a newer frame
 * arrived; the frame was dropped and the older snapshot painted last. A poll
 * refetch that resolves after a newer frame could also paint over it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readLiveTournamentState } from "../../server/repositories/live.ts";
import {
  deliverLiveChange,
  enterForeground,
  finishForegroundRefetch,
  holdLivePatch,
  openLiveSync,
  projectionRefetched,
  snapshotAfterPostgresReady,
  subscriptionConfirmed,
  subscriptionOpened,
} from "./catch-up.ts";
import { liveNodePatch } from "./node-patch.ts";
import { acceptLiveEvent, type LiveCell, type LiveRow } from "./patch.ts";

const NOW = Date.parse("2026-10-26T23:13:30.000Z");

function frame(sequence: number, occurredAt: string, score: string): LiveRow {
  return {
    public_ref: "pgtap-live-client-r0-m0",
    phase: "in_play",
    score_text: score,
    points_text: "15-0",
    serving_side: null,
    provisional_winner_ref: null,
    sequence,
    sequence_source: "updatedAt",
    received_at: occurredAt,
    occurred_at: occurredAt,
  };
}

function paint(cell: LiveCell, row: LiveRow, fromSnapshot: boolean): LiveCell & { score?: string } {
  const decision = acceptLiveEvent({ generation: 1, currentGeneration: 1, fromSnapshot, cell, row, now: NOW });
  if (decision.action !== "paint") return cell;
  return {
    official: false,
    sequence: decision.sequence,
    sequenceSource: decision.sequenceSource,
    occurredAt: decision.occurredAt,
    score: row.score_text ?? undefined,
  };
}

const F4 = frame(4, "2026-10-26T23:13:20.000Z", "6-4,3-3");
const F5 = frame(5, "2026-10-26T23:13:25.000Z", "6-4,4-3");

test("a snapshot older than the cell's provider clock does not paint over it", () => {
  const shown = paint({ official: false, sequence: null, sequenceSource: null }, F5, false);
  const late = acceptLiveEvent({ generation: 1, currentGeneration: 1, fromSnapshot: true, cell: shown, row: F4, now: NOW });
  assert.equal(late.action, "skip");
  assert.equal(late.reason, "older snapshot");
});

test("a snapshot at the same or a newer clock still repaints the cell", () => {
  const shown = paint({ official: false, sequence: null, sequenceSource: null }, F4, false);
  for (const row of [F4, F5]) {
    const again = acceptLiveEvent({ generation: 1, currentGeneration: 1, fromSnapshot: true, cell: shown, row, now: NOW });
    assert.equal(again.action, "paint");
  }
});

test("a frame that arrives during a foreground refetch is held, then applied after the snapshot", () => {
  let sync = projectionRefetched(subscriptionConfirmed(subscriptionOpened(openLiveSync<LiveRow>()))).sync;
  let cell = paint({ official: false, sequence: null, sequenceSource: null }, F4, false);

  // The tab comes back: refetch starts with the database at frame 4.
  sync = enterForeground(sync).sync;
  const snapshot = F4;
  // Frame 5 arrives while that refetch is in flight.
  const during = deliverLiveChange(sync, F5, { hidden: false, recovering: true });
  sync = during.sync;
  assert.equal(during.apply, null);

  cell = paint(cell, snapshot, true);
  const finished = finishForegroundRefetch(sync);
  assert.deepEqual(finished.replay, []);
  assert.deepEqual(finished.patches, [F5]);
  for (const held of finished.patches) cell = paint(cell, held, false);
  assert.equal(cell.score, "6-4,4-3");
  assert.equal(cell.sequence, 5);
});

test("frames missed while hidden are still not replayed", () => {
  let sync = projectionRefetched(subscriptionConfirmed(subscriptionOpened(openLiveSync<string>()))).sync;
  sync = deliverLiveChange(sync, "while-hidden", { hidden: true, recovering: false }).sync;
  sync = enterForeground(sync).sync;
  const finished = finishForegroundRefetch(sync);
  assert.deepEqual(finished.patches, []);
  assert.deepEqual(holdLivePatch(finished.sync, "later").held, []);
});

test("the snapshot carries the provider sequence, so held frames compare against it", async () => {
  const stored = {
    public_ref: "pgtap-live-client-r0-m0",
    phase: "in_play",
    score_text: "6-4,3-3",
    points_text: "15-0",
    serving_side: null,
    provisional_winner_ref: null,
    received_at: "2026-10-26T23:13:20.000Z",
    occurred_at: null,
    sequence: 4,
    sequence_source: "seq",
  };
  let columns = "";
  const supabase = {
    from: (table: string) => ({
      select: (selected: string) => {
        if (table === "live_match_state") columns = selected;
        return {
          eq: (_column: string, _value: string) => {
            const result =
              table === "tournaments"
                ? { data: [{ id: "t-1" }], error: null }
                : { data: [stored], error: null };
            return Object.assign(Promise.resolve(result), {
              maybeSingle: () => Promise.resolve({ data: { id: "t-1" }, error: null }),
            });
          },
        };
      },
    }),
  };
  const state = await readLiveTournamentState(supabase as never, "pgtap-live-client");
  assert.ok(columns.includes("sequence") && columns.includes("sequence_source"));
  const row = liveNodePatch(state?.matches[0]);
  assert.equal(row?.sequence, 4);
  assert.equal(row?.sequence_source, "seq");

  // A later frame without clocks now passes the sequence check against the snapshot.
  const cell = paint({ official: false, sequence: null, sequenceSource: null }, row!, true);
  const next = acceptLiveEvent({
    generation: 1,
    currentGeneration: 1,
    fromSnapshot: false,
    cell,
    row: { ...row!, sequence: 5, score_text: "6-4,4-3" },
    now: NOW,
  });
  assert.equal(next.action, "paint");
});

test("frames held while recovering are released even when the channel is already live", () => {
  // Seen in the browser: a reconnect finished its own snapshot (phase apply)
  // while the foreground refetch was still marked in flight.
  let sync = projectionRefetched(subscriptionConfirmed(subscriptionOpened(openLiveSync<string>()))).sync;
  assert.equal(sync.phase, "apply");
  sync = deliverLiveChange(sync, "frame-5", { hidden: false, recovering: true }).sync;
  const finished = finishForegroundRefetch(sync);
  assert.deepEqual(finished.patches, ["frame-5"]);
  assert.deepEqual(finished.sync, { phase: "apply", held: [] });

  // A channel still opening keeps its frames for its own first snapshot.
  const opening = deliverLiveChange(subscriptionOpened(openLiveSync<string>()), "early", {
    hidden: false,
    recovering: true,
  }).sync;
  assert.deepEqual(finishForegroundRefetch(opening).patches, []);
  assert.deepEqual(projectionRefetched(subscriptionConfirmed(opening)).patches, ["early"]);
});

test("F-2: a Postgres notice after the first snapshot started reads once more", () => {
  // Seen after `supabase db reset`: the join reply came at 0.5 s, the first
  // snapshot read at about 4 s, and "Subscribed to PostgreSQL" at 8 s. A frame
  // written between 4 s and 8 s reached neither.
  assert.equal(snapshotAfterPostgresReady("pending"), "none");
  assert.equal(snapshotAfterPostgresReady("in-flight"), "after-first");
  assert.equal(snapshotAfterPostgresReady("done"), "now");
});
