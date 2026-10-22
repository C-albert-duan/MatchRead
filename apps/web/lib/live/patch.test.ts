import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptLiveEvent, isLiveStale, resumeLiveTransport, type LiveRow } from "./patch.ts";

const row: LiveRow = {
  public_ref: "mx-1",
  phase: "in_play",
  score_text: "6-4,1-1",
  points_text: "15-30",
  serving_side: "b",
  provisional_winner_ref: null,
  sequence: 4,
  sequence_source: "seq",
  received_at: "2026-10-09T15:01:00.000Z",
};

const now = Date.parse("2026-10-09T15:01:10.000Z");

test("a live frame paints the cell and does not advance", () => {
  const paint = acceptLiveEvent({
    generation: 1,
    currentGeneration: 1,
    fromSnapshot: false,
    cell: { official: false, sequence: 2, sequenceSource: "seq" },
    row,
    now,
  });
  assert.equal(paint.action, "paint");
  assert.equal(paint.advance, false);
  assert.equal(paint.presentation?.state, "live");
  assert.equal(paint.presentation?.labelKey, "live.badge");
  assert.equal(paint.presentation?.showScore, "6-4,1-1 · 15-30");
  assert.equal(paint.presentation?.servingSide, "b");
  assert.equal(paint.presentation?.stale, false);
  assert.equal(paint.provisionalWinnerRef, null);
});

test("an official cell ignores a live frame", () => {
  const paint = acceptLiveEvent({
    generation: 1,
    currentGeneration: 1,
    fromSnapshot: true,
    cell: { official: true, sequence: null, sequenceSource: null },
    row,
    now,
  });
  assert.equal(paint.action, "skip");
  assert.equal(paint.reason, "official");
  assert.equal(paint.advance, false);
});

test("an older frame and a dropped channel do not roll the cell back", () => {
  const older = acceptLiveEvent({
    generation: 2,
    currentGeneration: 2,
    fromSnapshot: false,
    cell: { official: false, sequence: 5, sequenceSource: "seq" },
    row,
    now,
  });
  assert.equal(older.reason, "out of order");
  const dropped = acceptLiveEvent({
    generation: 1,
    currentGeneration: 2,
    fromSnapshot: false,
    cell: { official: false, sequence: null, sequenceSource: null },
    row,
    now,
  });
  assert.equal(dropped.reason, "stale channel");
});

test("a snapshot refetch replaces the cell with the current row", () => {
  const paint = acceptLiveEvent({
    generation: 3,
    currentGeneration: 3,
    fromSnapshot: true,
    cell: { official: false, sequence: 9, sequenceSource: "seq" },
    row,
    now,
  });
  assert.equal(paint.action, "paint");
  assert.equal(paint.sequence, 4);
});

test("a terminal frame stays provisional", () => {
  const paint = acceptLiveEvent({
    generation: 1,
    currentGeneration: 1,
    fromSnapshot: false,
    cell: { official: false, sequence: null, sequenceSource: null },
    row: {
      ...row,
      phase: "provisional_final",
      score_text: "6-4,6-2",
      points_text: null,
      serving_side: "a",
      provisional_winner_ref: "p-a",
      sequence: 5,
    },
    now,
  });
  assert.equal(paint.presentation?.state, "provisional");
  assert.equal(paint.presentation?.labelKey, "live.provisional");
  assert.equal(paint.presentation?.servingSide, null);
  assert.equal(paint.presentation?.showScore, "6-4 6-2");
  assert.equal(paint.provisionalWinnerRef, "p-a");
  assert.equal(paint.advance, false);
});

test("a quiet live row becomes stale", () => {
  assert.equal(isLiveStale(row.received_at, now, 45_000), false);
  assert.equal(isLiveStale(row.received_at, now + 46_000, 45_000), true);
  const paint = acceptLiveEvent({
    generation: 1,
    currentGeneration: 1,
    fromSnapshot: true,
    cell: { official: false, sequence: null, sequenceSource: null },
    row,
    now: now + 46_000,
  });
  assert.equal(paint.presentation?.stale, true);
  assert.equal(paint.presentation?.state, "live");
});

test("I7 stale or out-of-order frames cannot roll the cell backward", () => {
  // Captured live rows have updatedAt and no seq. An equal clock has no second
  // provider sequence, so a later arrival does not replace the cell.
  const now = Date.parse("2026-10-09T19:00:10.000Z");
  const base: LiveRow = {
    public_ref: "mx-1",
    phase: "in_play",
    score_text: "6-4",
    points_text: "15-0",
    serving_side: "a",
    provisional_winner_ref: null,
    sequence: 1,
    sequence_source: "updatedAt",
    received_at: "2026-10-09T18:00:01.000Z",
    occurred_at: "2026-10-09T18:00:00.000Z",
  };
  const open = {
    generation: 1,
    currentGeneration: 1,
    fromSnapshot: false,
    now,
  };

  const first = acceptLiveEvent({
    ...open,
    cell: { official: false, sequence: null, sequenceSource: null, occurredAt: null },
    row: base,
  });
  assert.equal(first.action, "paint");
  assert.equal(first.presentation?.showScore, "6-4 · 15-0");

  let cell = {
    official: false,
    sequence: first.sequence,
    sequenceSource: first.sequenceSource,
    occurredAt: first.occurredAt,
  };
  const newer = acceptLiveEvent({
    ...open,
    cell,
    row: {
      ...base,
      score_text: "6-4,3-3",
      points_text: "30-0",
      sequence: 2,
      received_at: "2026-10-09T18:05:01.000Z",
      occurred_at: "2026-10-09T18:05:00.000Z",
    },
  });
  assert.equal(newer.action, "paint");
  assert.equal(newer.presentation?.showScore, "6-4,3-3 · 30-0");
  cell = {
    official: false,
    sequence: newer.sequence,
    sequenceSource: newer.sequenceSource,
    occurredAt: newer.occurredAt,
  };

  const older = acceptLiveEvent({
    ...open,
    cell,
    row: {
      ...base,
      score_text: "0-0",
      sequence: 50,
      received_at: "2026-10-09T19:00:00.000Z",
      occurred_at: "2026-10-09T18:00:00.000Z",
    },
  });
  assert.equal(older.action, "skip");
  assert.equal(older.reason, "out of order");
  assert.equal(older.presentation, null);

  const equal = acceptLiveEvent({
    ...open,
    cell,
    row: {
      ...base,
      score_text: "6-0,6-0",
      phase: "provisional_final",
      sequence: 90,
      received_at: "2026-10-09T19:00:00.000Z",
      occurred_at: "2026-10-09T14:05:00.000-04:00",
    },
  });
  assert.equal(equal.action, "skip");
  assert.equal(equal.reason, "equal clock");
  assert.equal(equal.occurredAt, cell.occurredAt);

  const replayed = [
    base,
    {
      ...base,
      score_text: "0-0",
      sequence: 50,
      received_at: "2026-10-09T19:00:00.000Z",
      occurred_at: "2026-10-09T18:00:00.000Z",
    },
    {
      ...base,
      score_text: "6-0,6-0",
      sequence: 90,
      received_at: "2026-10-09T19:00:00.000Z",
      occurred_at: "2026-10-09T18:05:00.000Z",
    },
  ];
  for (const row of replayed) {
    const again = acceptLiveEvent({ ...open, cell, row });
    assert.equal(again.action, "skip");
    assert.equal(again.presentation, null);
    assert.equal(again.occurredAt, "2026-10-09T18:05:00.000Z");
  }
});

test("returning to a tab refetches instead of replaying", () => {
  assert.deepEqual(resumeLiveTransport(), {
    dropQueuedEvents: true,
    refetch: true,
    replay: false,
  });
});
