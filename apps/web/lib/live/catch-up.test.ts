import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptVisibilityChange,
  deliverLiveChange,
  enterForeground,
  finishForegroundRefetch,
  holdLivePatch,
  openLiveSync,
  projectionRefetched,
  recoverVisibleTab,
  subscriptionConfirmed,
  subscriptionOpened,
} from "./catch-up.ts";

test("a patch in the subscribe gap is applied after the snapshot", () => {
  let sync = openLiveSync<string>();
  assert.equal(sync.phase, "subscribe");
  assert.deepEqual(projectionRefetched(sync).patches, []);
  assert.equal(projectionRefetched(sync).sync.phase, "subscribe");

  sync = subscriptionOpened(sync);
  sync = holdLivePatch(sync, "after-subscribe");
  assert.equal(sync.phase, "confirm");
  assert.deepEqual(projectionRefetched(sync).patches, []);

  sync = subscriptionConfirmed(sync);
  assert.equal(sync.phase, "refetch");
  sync = holdLivePatch(sync, "during-refetch");
  const flushed = projectionRefetched(sync);
  assert.deepEqual(flushed.patches, ["after-subscribe", "during-refetch"]);
  assert.equal(flushed.sync.phase, "apply");
  assert.deepEqual(holdLivePatch(flushed.sync, "later").held, []);
});

test("a visible tab refetches and does not replay what it missed", () => {
  const hidden: { phase: "apply"; held: string[] } = {
    phase: "apply",
    held: ["missed-a", "missed-b"],
  };
  const stayed = acceptVisibilityChange(hidden, "hidden");
  assert.equal(stayed.refetch, false);
  assert.deepEqual(stayed.replay, []);
  assert.deepEqual(stayed.sync.held, ["missed-a", "missed-b"]);

  const recovered = acceptVisibilityChange(hidden, "visible");
  assert.equal(recovered.refetch, true);
  assert.deepEqual(recovered.replay, []);
  assert.deepEqual(recovered.sync.held, []);
  assert.equal(recovered.sync.phase, "refetch");
  assert.deepEqual(projectionRefetched(recovered.sync).patches, []);
  assert.deepEqual(recoverVisibleTab(hidden).replay, []);
});

test("a stale background client refetches, does not replay the backlog, and keeps frames from after it returned", () => {
  let sync = projectionRefetched(
    holdLivePatch(subscriptionConfirmed(subscriptionOpened(openLiveSync<string>())), "shown")
  ).sync;
  assert.equal(sync.phase, "apply");

  for (const score of ["1-0", "2-1", "3-2"]) {
    const hidden = deliverLiveChange(sync, score, { hidden: true, recovering: false });
    sync = hidden.sync;
    assert.equal(hidden.apply, null);
  }
  assert.deepEqual(sync.held, []);

  const resumed = enterForeground(sync);
  assert.equal(resumed.refetch, true);
  assert.deepEqual(resumed.replay, []);
  sync = resumed.sync;
  assert.equal(sync.phase, "refetch");
  assert.deepEqual(sync.held, []);

  // A frame after the tab is visible is not backlog: it waits for the snapshot.
  const during = deliverLiveChange(sync, "4-3", { hidden: false, recovering: true });
  sync = during.sync;
  assert.equal(during.apply, null);
  assert.deepEqual(sync.held, ["4-3"]);

  const finished = finishForegroundRefetch(sync);
  assert.deepEqual(finished.replay, []);
  assert.deepEqual(finished.patches, ["4-3"]);
  assert.equal(finished.sync.phase, "apply");
  assert.deepEqual(finished.sync.held, []);

  const current = deliverLiveChange(finished.sync, "6-4", { hidden: false, recovering: false });
  assert.equal(current.apply, "6-4");
});

test("returning before the channel is live still refetches and drops the queue", () => {
  const opening = holdLivePatch(subscriptionOpened(openLiveSync<string>()), "queued");
  const resumed = enterForeground(opening);
  assert.equal(resumed.refetch, true);
  assert.deepEqual(resumed.replay, []);
  assert.deepEqual(resumed.sync.held, []);
  assert.equal(resumed.sync.phase, "confirm");
  const finished = finishForegroundRefetch(resumed.sync);
  assert.deepEqual(finished.replay, []);
  assert.equal(finished.sync.phase, "confirm");
});

test("refetch is refused until the subscription is confirmed", () => {
  const opened = subscriptionOpened(openLiveSync<string>());
  assert.equal(subscriptionConfirmed(opened).phase, "refetch");
  assert.equal(subscriptionConfirmed(openLiveSync()).phase, "subscribe");
  assert.equal(subscriptionOpened(subscriptionConfirmed(opened)).phase, "refetch");
});
