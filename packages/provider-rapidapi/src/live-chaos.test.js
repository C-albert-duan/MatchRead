/**
 * Chaos suite. Each case checks the live row and the official match.
 * Ingest cases go through acceptForwardedLive.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createListenerSession } from "../../../apps/listener/src/session.ts";
import {
  armRealtimeRecovery,
  isRealtimeLoss,
  nextRealtimeRecovery,
} from "../../../apps/web/lib/live/disconnect.ts";
import {
  deliverLiveChange,
  enterForeground,
  finishForegroundRefetch,
} from "../../../apps/web/lib/live/catch-up.ts";
import { connectLive } from "./index.js";
import { openProviderSocket } from "./live-frame.js";
import { proactiveRefreshEnabled } from "./live.js";
import {
  createReplayAdmin,
  liveRows,
  replayThroughIngest,
  seedReplayCatalog,
} from "./live-replay-harness.js";
import { createLiveSessionState, onSocketDisconnect } from "./live-session.js";

const root = path.resolve(import.meta.dirname, "../../..");
const catalog = JSON.parse(
  readFileSync(path.join(root, "fixtures", "live-replay", "catalog.json"), "utf8")
);

function frame(partial = {}) {
  return {
    source: "replay",
    seq: 2,
    id: "evt-live-1",
    matchId: "101-202-9001-1",
    status: "InPlay",
    score: "1-0",
    points: "30-15",
    indicator: "1,0",
    receivedAt: "2026-10-09T15:10:00.000Z",
    ...partial,
  };
}

function officialOf(admin) {
  return admin.tables.matches.map((row) => ({
    id: row.id,
    winner_player_id: row.winner_player_id ?? null,
    settled_at: row.settled_at ?? null,
    official_score: row.official_score ?? null,
    voided: Boolean(row.voided),
    side_a_player_id: row.side_a_player_id ?? null,
    side_b_player_id: row.side_b_player_id ?? null,
  }));
}

async function play(frames, source = catalog) {
  const admin = createReplayAdmin();
  seedReplayCatalog(admin, source);
  const before = officialOf(admin);
  const result = await replayThroughIngest(admin, frames, []);
  return { admin, before, result };
}

function token(exp, iat) {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ exp, iat })).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("chaos suite", () => {
  it("kills the socket mid-set and keeps the live score", async () => {
    const mid = frame();
    const { admin, before } = await play([mid]);
    const live = liveRows(admin);
    assert.equal(live.length, 1);
    assert.equal(live[0].phase, "in_play");
    assert.equal(live[0].score_text, "1-0");
    assert.equal(live[0].points_text, "30-15");

    const session = createLiveSessionState();
    session.state = "CONNECTED";
    session.allowJoin = true;
    session.joinedEventIds.add("evt-live-1");
    onSocketDisconnect(session);
    assert.equal(session.state, "STALE");
    assert.equal(session.allowJoin, false);
    assert.equal(session.joinedEventIds.size, 0);
    let socketCode = null;
    try {
      openProviderSocket({ MATCHREAD_LIVE_SOCKET: "1" });
    } catch (error) {
      socketCode = error.code;
    }
    assert.equal(socketCode, "SOCKET_UNVERIFIED");

    assert.deepEqual(liveRows(admin), live);
    assert.deepEqual(officialOf(admin), before);
  });

  it("expires the token mid-match on the virtual clock and stays on REST", async () => {
    const mid = frame();
    const { admin, before } = await play([mid]);
    const live = liveRows(admin);
    const exp = Math.floor(Date.parse(mid.receivedAt) / 1000) + 60;
    const issued = [];
    const notes = [];
    const client = {
      async get(requestPath) {
        if (String(requestPath).includes("ws-token")) {
          const nextExp = issued.length === 0 ? exp : exp + 86_400;
          const value = token(nextExp, exp - 120);
          issued.push(value);
          return { success: true, token: value };
        }
        return { results: [] };
      },
    };
    const liveClient = await connectLive({ RAPIDAPI_KEY: "chaos-key" }, client, {
      info: (message) => notes.push(message),
    });
    assert.equal(proactiveRefreshEnabled({}), false);
    await liveClient.getLiveEvents(exp * 1000);
    assert.equal(issued.length, 2);
    assert.equal(notes.some((line) => line.includes('"name":"token_expired"')), true);
    assert.equal(liveClient.transport, "rest");
    assert.deepEqual(liveRows(admin), live);
    assert.deepEqual(officialOf(admin), before);
  });

  it("drops a duplicate frame and leaves the live row", async () => {
    const first = frame({ receivedAt: "2026-10-09T15:10:00.000Z" });
    const again = frame({ receivedAt: "2026-10-09T15:10:05.000Z" });
    const { admin, before, result } = await play([first, again]);
    assert.equal(result.tournaments, 1);
    const live = liveRows(admin);
    assert.equal(live.length, 1);
    assert.equal(live[0].score_text, "1-0");
    assert.equal(live[0].points_text, "30-15");
    assert.equal(admin.tables.platform_events.length, 1);
    const repeat = await replayThroughIngest(admin, [again], []);
    assert.equal(repeat.tournaments, 0);
    assert.deepEqual(liveRows(admin), live);
    assert.deepEqual(officialOf(admin), before);
  });

  it("ignores an out-of-order frame and keeps the later score", async () => {
    const later = frame({
      seq: 4,
      score: "6-4,1-1",
      points: "0-15",
      receivedAt: "2026-10-09T15:20:00.000Z",
    });
    const earlier = frame({
      seq: 3,
      score: "0-0",
      points: "0-0",
      receivedAt: "2026-10-09T15:20:05.000Z",
    });
    const { admin, before } = await play([later, earlier]);
    const live = liveRows(admin);
    assert.equal(live.length, 1);
    assert.equal(live[0].score_text, "6-4,1-1");
    assert.equal(live[0].points_text, "0-15");
    assert.equal(live[0].sequence, 4);
    assert.equal(live[0].phase, "in_play");
    assert.deepEqual(officialOf(admin), before);
  });

  it("records a REST contradiction and does not change the official score", async () => {
    const settled = {
      ...catalog,
      matches: [
        {
          ...catalog.matches[0],
          officially_settled: true,
          official_score: "6-4,6-4",
        },
      ],
    };
    const socket = frame({
      seq: 8,
      replayPhase: "terminal",
      replayWinnerId: "101",
      score: "6-2,6-1",
      points: null,
      receivedAt: "2026-10-09T16:00:00.000Z",
    });
    const { admin, before } = await play([socket], settled);
    assert.equal(liveRows(admin).length, 0);
    assert.equal(before[0].official_score, "6-4,6-4");
    assert.equal(before[0].settled_at, "2026-10-09T00:00:00.000Z");
    assert.deepEqual(officialOf(admin), before);
    const disagreement = admin.tables.ops_events.find((row) => row.name === "live_rest_disagreement");
    assert.ok(disagreement);
    assert.equal(disagreement.payload.live_score, "6-2,6-1");
    assert.equal(disagreement.payload.official_score, "6-4,6-4");
    assert.equal(disagreement.payload.official_winner_ref, null);
  });

  it("restarts the listener and does not project the same raw frame again", async () => {
    const mid = frame();
    const firstSession = createListenerSession();
    assert.equal(firstSession.takeChanged([mid]).length, 1);
    firstSession.commitLastTake();
    assert.equal(firstSession.takeChanged([{ ...mid, receivedAt: "2026-10-09T15:11:00.000Z" }]).length, 0);

    const { admin, before } = await play([mid]);
    const live = liveRows(admin);
    const restarted = createListenerSession();
    const posted = restarted.takeChanged([mid]);
    assert.equal(posted.length, 1);
    const second = await replayThroughIngest(admin, posted, []);
    assert.equal(second.tournaments, 0);
    assert.equal(admin.tables.platform_events.length, 1);
    assert.deepEqual(liveRows(admin), live);
    assert.deepEqual(officialOf(admin), before);
  });

  it("recovers a Realtime disconnect without writing the official match", async () => {
    const { admin, before } = await play([frame()]);
    const live = liveRows(admin);
    assert.equal(isRealtimeLoss("CHANNEL_ERROR"), true);
    assert.equal(isRealtimeLoss("CLOSED"), true);
    const armed = armRealtimeRecovery({ failures: 0, waiting: false });
    assert.equal(armed.arm, true);
    assert.equal(armed.step.mode, "retry");
    assert.equal(armed.step.waitMs, nextRealtimeRecovery(0).waitMs);
    const stacked = armRealtimeRecovery({ failures: armed.failures, waiting: true });
    assert.equal(stacked.arm, false);
    assert.deepEqual(liveRows(admin), live);
    assert.deepEqual(officialOf(admin), before);
  });

  it("refetches on foreground and does not replay frames missed in the background", async () => {
    const { admin, before } = await play([frame()]);
    const live = liveRows(admin);
    let sync = { phase: "apply", held: ["held-before-hide"] };
    for (const score of ["2-1", "3-2", "4-3"]) {
      const hidden = deliverLiveChange(sync, score, { hidden: true, recovering: false });
      sync = hidden.sync;
      assert.equal(hidden.apply, null);
    }
    const resumed = enterForeground(sync);
    assert.equal(resumed.refetch, true);
    assert.deepEqual(resumed.replay, []);
    const during = deliverLiveChange(resumed.sync, "5-4", { hidden: false, recovering: true });
    const finished = finishForegroundRefetch(during.sync);
    assert.deepEqual(finished.replay, []);
    assert.deepEqual(liveRows(admin), live);
    assert.deepEqual(officialOf(admin), before);
  });

  it("archives an unknown provider event and does not open a live row", async () => {
    const known = frame();
    const { admin, before } = await play([known]);
    const live = liveRows(admin);
    const unknown = frame({
      seq: 1,
      id: "evt-missing",
      matchId: "303-404-9001-1",
      score: "6-0,6-0",
      receivedAt: "2026-10-09T15:30:00.000Z",
    });
    const result = await replayThroughIngest(admin, [unknown], []);
    assert.equal(result.unmappedCarried, 1);
    assert.equal(admin.tables.unmapped_live_events.length, 1);
    assert.equal(admin.tables.unmapped_live_events[0].provider_event_id, "evt-missing");
    assert.deepEqual(liveRows(admin), live);
    assert.deepEqual(officialOf(admin), before);
  });

  it("leaves serving and an unknown player unmapped", async () => {
    const mid = frame({ indicator: "1,0", servingPlayerId: "202" });
    const { admin, before } = await play([mid]);
    const live = liveRows(admin)[0];
    assert.equal(live.phase, "in_play");
    assert.equal(live.serving_side, null);
    assert.equal(live.provisional_winner_ref, null);

    const terminal = frame({
      seq: 6,
      replayPhase: "terminal",
      replayWinnerId: "999",
      score: "6-4,6-2",
      points: null,
      indicator: "0,1",
      servingPlayerId: "999",
      receivedAt: "2026-10-09T16:00:00.000Z",
    });
    await replayThroughIngest(admin, [terminal], []);
    const next = liveRows(admin)[0];
    assert.equal(next.phase, "provisional_final");
    assert.equal(next.serving_side, null);
    assert.equal(next.provisional_winner_ref, null);
    assert.equal(next.score_text, "6-4,6-2");
    assert.deepEqual(officialOf(admin), before);
  });
});
