import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  canonicalGame,
  canonicalLiveFrame,
  canonicalSets,
  explicitServingId,
  liveRowsFromNdjson,
  liveStateRow,
  mapFrameToMatch,
  openProviderSocket,
  projectLiveFrame,
  providerSide,
  providerSocketEnabled,
  resolvePlayerSides,
  replayLiveFrames,
} from "./live-frame.js";
import { m1CaptureSkip } from "./live-replay-harness.js";

const root = path.resolve(import.meta.dirname, "../../..");
const replayDir = path.join(root, "fixtures", "live-replay");

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(replayDir, name), "utf8"));
}

function loadLines(name) {
  return liveRowsFromNdjson(readFileSync(path.join(replayDir, name), "utf8"));
}

const catalog = loadJson("catalog.json");

function assertNeverSettles(steps) {
  for (const step of steps) {
    assert.equal(step.officialPatch, null);
    assert.equal(step.advance, false);
  }
}

describe("canonical live values", () => {
  it("keeps set text and tennis point strings, and drops a non-point game", () => {
    assert.equal(canonicalSets("6-4,3-3"), "6-4,3-3");
    assert.equal(canonicalSets("6-4, 3-3"), null);
    assert.equal(canonicalGame("40-A"), "40-AD");
    assert.equal(canonicalGame("AD-40"), "AD-40");
    assert.equal(canonicalGame("0-15"), "0-15");
    assert.equal(canonicalGame("15-30"), "15-30");
    assert.equal(canonicalGame("3-2"), null);
    assert.equal(canonicalGame("5-2"), null);
    assert.equal(typeof canonicalGame("40-AD"), "string");
    const projected = projectLiveFrame(null, {
      frame: canonicalLiveFrame({
        id: "7000001",
        matchId: "101-202-9001-1",
        status: "InPlay",
        score: "6-4,3-3",
        points: "40-A",
        indicator: "1,0",
        updatedAt: "2026-10-07T12:22:20.000Z",
        receivedAt: "2026-10-07T12:22:22.507Z",
        player1: { name: "Alpha" },
      }).frame,
      match: {
        match_id: "m-1",
        match_key: "r0-m0",
        public_ref: "mx-1",
        tournament_id: "t-1",
        tournament_provider_id: "9001",
        side_a_provider_id: "101",
        side_b_provider_id: "202",
      },
    });
    assert.equal(projected.state.score_text, "6-4,3-3");
    assert.equal(projected.state.points_text, "40-AD");
    assert.equal(projected.state.serving_side, null);
    assert.equal(projected.state.flag, "live");
    assert.equal(projected.state.stats, null);
    assert.equal(projected.state.provisional_winner_ref, null);
    assert.equal(Object.hasOwn(projected.state, "winner_side"), false);
    assert.equal(Object.hasOwn(projected.state, "payload"), false);
    assert.equal(projected.state.occurred_at, "2026-10-07T12:22:20.000Z");
    assert.equal(projected.state.received_at, "2026-10-07T12:22:22.507Z");
  });
});

describe("canonical live frame", () => {
  it("reads the captured REST score fields and does not treat indicator as a server", () => {
    const [row] = loadLines("rest-capture.ndjson");
    const canon = canonicalLiveFrame(row);
    assert.equal(canon.ok, true);
    assert.equal(canon.frame.phase, "in_play");
    assert.equal(canon.frame.score, "6-4,3-3");
    assert.equal(canon.frame.points, "40-30");
    assert.equal(canon.frame.indicator, "1,0");
    assert.equal(canon.frame.servingProviderId, null);
    assert.equal(explicitServingId(row), null);
    assert.equal(canon.frame.eventId, "7000001");
    assert.equal(canon.frame.sequence_source, "updatedAt");
    assert.equal(canon.frame.occurred_at, "2026-10-07T12:22:20.000Z");
    assert.equal(canon.frame.points, "40-30");
    assert.equal(canon.frame.provisionalWinnerProviderId, null);
  });

  it("does not read an uncaptured server or winner field, and a replay terminal stays provisional", () => {
    const captured = canonicalLiveFrame({
      source: "rest",
      id: "7000001",
      matchId: "101-202-9001-1",
      status: "InPlay",
      score: "6-4,3-3",
      points: "40-30",
      indicator: "1,0",
      critical: "break point",
      servingPlayerId: "202",
      winnerId: "202",
      updatedAt: "2026-10-07T12:22:20.000Z",
    });
    assert.equal(captured.frame.phase, "in_play");
    assert.equal(captured.frame.servingProviderId, null);
    assert.equal(captured.frame.provisionalWinnerProviderId, null);
    assert.equal(Object.hasOwn(captured.frame, "critical"), false);
    assert.equal(explicitServingId(captured.frame), null);

    const terminal = canonicalLiveFrame({
      source: "replay",
      seq: 8,
      replayPhase: "terminal",
      replayWinnerId: "202",
      id: "evt-live-1",
      matchId: "101-202-9001-1",
      status: "InPlay",
      score: "6-3,6-4",
      indicator: "1,0",
    });
    assert.equal(terminal.frame.phase, "terminal");
    assert.equal(terminal.frame.occurred_at, null);
    assert.equal(terminal.frame.servingProviderId, null);
    assert.equal(terminal.frame.provisionalWinnerProviderId, "202");
    const projected = projectLiveFrame(null, {
      frame: terminal.frame,
      match: catalog.matches[0],
    });
    assert.equal(projected.action, "apply");
    assert.equal(projected.state.phase, "provisional_final");
    assert.equal(projected.state.serving_side, null);
    assert.equal(projected.state.provisional_winner_ref, "p-b");
    assert.equal(projected.officialPatch, null);
    assert.equal(projected.advance, false);
    const row = liveStateRow(projected.state);
    for (const key of ["winner_player_id", "official_score", "settled_at", "voided"]) {
      assert.equal(Object.hasOwn(row, key), false);
    }
  });
});

describe("duplicate live frame", () => {
  it("does not apply, advance, or patch an official score", () => {
    const canon = canonicalLiveFrame({
      id: "evt-1",
      matchId: "101-202-9001-1",
      status: "InPlay",
      score: "6-4",
      points: "15-0",
      updatedAt: 1_700_000_000_000,
    });
    const match = catalog.matches[0];
    const first = projectLiveFrame(null, { frame: canon.frame, match });
    const second = projectLiveFrame(first.state, { frame: canon.frame, match });
    assert.equal(first.action, "apply");
    assert.equal(first.advance, false);
    assert.equal(first.officialPatch, null);
    assert.equal(second.action, "ignored");
    assert.equal(second.advance, false);
    assert.equal(second.officialPatch, null);
    assert.equal(second.state, first.state);
    for (const key of ["winner_player_id", "official_score", "settled_at", "voided"]) {
      assert.equal(Object.hasOwn(liveStateRow(first.state), key), false);
    }
  });
});

describe("prototype TIMELINE replay", () => {
  it("keeps the latest in-order frame and never settles", () => {
    const replay = replayLiveFrames(loadLines("TIMELINE.ndjson"), catalog);
    assertNeverSettles(replay.steps);
    assert.deepEqual(replay.health, {
      applied: 4,
      duplicate: 1,
      ignored: 2,
      unmapped: 0,
      ambiguous: 0,
      disagreements: 0,
    });
    assert.equal(replay.states.length, 1);
    const state = replay.states[0];
    assert.equal(state.public_ref, "mx-1");
    assert.equal(state.phase, "provisional_final");
    assert.equal(state.score_text, "6-4,6-2");
    assert.equal(state.points_text, null);
    assert.equal(state.sequence, 5);
    assert.equal(state.serving_side, null);
    assert.equal(state.provisional_winner_ref, "p-a");
    assert.equal(replay.steps[0].state.serving_side, null);
    assert.equal(replay.steps[4].state.serving_side, null);
    assert.equal(state.match_key, "r0-m0");
  });
});

describe("chaos replay", () => {
  it("drops rewinds, duplicates, source changes, and fixture-id collisions", () => {
    const replay = replayLiveFrames(loadLines("chaos.ndjson"), catalog);
    assertNeverSettles(replay.steps);
    assert.deepEqual(replay.health, {
      applied: 5,
      duplicate: 2,
      ignored: 5,
      unmapped: 2,
      ambiguous: 0,
      disagreements: 0,
    });
    const state = replay.states[0];
    assert.equal(state.phase, "provisional_final");
    assert.equal(state.score_text, "6-4,3-1");
    assert.equal(state.provisional_winner_ref, "p-a");
    assert.equal(state.sequence, 6);
    const served = replay.steps[4];
    assert.equal(served.action, "apply");
    assert.equal(served.state.serving_side, null);
    assert.equal(served.state.score_text, "2-1");
  });

  it("does not paint over an official match", () => {
    const settled = {
      ...catalog.matches[0],
      officially_settled: true,
    };
    const canon = canonicalLiveFrame(loadLines("TIMELINE.ndjson").at(-1));
    const projected = projectLiveFrame(null, { frame: canon.frame, match: settled });
    assert.equal(projected.action, "ignored");
    assert.equal(projected.reason, "already official");
    assert.equal(projected.state, null);
    assert.equal(projected.officialPatch, null);
    assert.equal(projected.advance, false);
    assert.equal(projected.disagreement, null);
  });

  it("records a live and REST disagreement without an official patch", () => {
    const settled = {
      ...catalog.matches[0],
      officially_settled: true,
      official_score: "6-3,6-4",
      winner_ref: "p-b",
    };
    const canon = canonicalLiveFrame(loadLines("TIMELINE.ndjson").at(-1));
    const projected = projectLiveFrame(null, { frame: canon.frame, match: settled });
    assert.equal(projected.action, "ignored");
    assert.equal(projected.officialPatch, null);
    assert.equal(projected.advance, false);
    assert.equal(projected.state, null);
    assert.equal(projected.disagreement.name, "live_rest_disagreement");
    assert.equal(projected.disagreement.payload.live_score, "6-4,6-2");
    assert.equal(projected.disagreement.payload.official_score, "6-3,6-4");
    assert.equal(projected.disagreement.payload.live_winner_ref, "p-a");
    assert.equal(projected.disagreement.payload.official_winner_ref, "p-b");
    assert.equal(projected.officialPatch, null);
  });

  it("treats a comma and a space as the same score and still records a different winner", () => {
    const settled = {
      ...catalog.matches[0],
      officially_settled: true,
      official_score: "6-4 6-2",
      winner_ref: "p-a",
    };
    const canon = canonicalLiveFrame(loadLines("TIMELINE.ndjson").at(-1));
    const same = projectLiveFrame(null, { frame: canon.frame, match: settled });
    assert.equal(same.action, "ignored");
    assert.equal(same.disagreement, null);
    assert.equal(same.officialPatch, null);
    assert.equal(same.advance, false);

    const other = projectLiveFrame(null, {
      frame: canon.frame,
      match: { ...settled, winner_ref: "ATP-p-b" },
    });
    assert.equal(other.officialPatch, null);
    assert.equal(other.disagreement.payload.live_score, "6-4,6-2");
    assert.equal(other.disagreement.payload.official_score, "6-4 6-2");
    assert.equal(other.disagreement.payload.live_winner_ref, "p-a");
    assert.equal(other.disagreement.payload.official_winner_ref, "ATP-p-b");
  });

  it("fails closed when two matches share the pair", () => {
    const twin = {
      ...catalog,
      matches: [
        catalog.matches[0],
        { ...catalog.matches[0], match_id: "m-2", public_ref: "mx-2", match_key: "r0-m1" },
      ],
      eventMap: [],
    };
    const canon = canonicalLiveFrame(loadLines("TIMELINE.ndjson")[0]);
    const mapped = mapFrameToMatch(canon.frame, twin);
    assert.equal(mapped.status, "ambiguous");
  });

  it("archives an unmapped event instead of guessing by name or time", () => {
    const raw = {
      id: "live-unknown",
      tourType: "atp",
      matchId: "9-8-42-1",
      status: "InPlay",
      score: "1-0",
      player1: { name: "Alpha" },
      player2: { name: "Beta" },
      startTimestamp: 1710000000,
      receivedAt: "2026-10-09T18:00:00.000Z",
    };
    const catalog = {
      matches: [
        {
          match_id: "m-1",
          match_key: "r0-m0",
          public_ref: "mx-1",
          tournament_id: "t-1",
          tournament_provider_id: "42",
          side_a_provider_id: "1",
          side_b_provider_id: "2",
          side_a_ref: "1",
          side_b_ref: "2",
          scheduled_at: "2026-10-09T18:00:00.000Z",
        },
      ],
    };
    const replay = replayLiveFrames([raw], catalog);
    assert.equal(replay.health.unmapped, 1);
    assert.equal(replay.states.length, 0);
    assert.equal(replay.unknown.length, 1);
    assert.equal(replay.unknown[0].log.name, "unmapped_event");
    assert.equal(replay.unknown[0].log.payload.provider_event_id, "live-unknown");
    assert.equal(replay.unknown[0].archive.payload, raw);
    assert.equal(Object.hasOwn(replay.unknown[0].archive, "match_id"), false);
    assert.equal(Object.hasOwn(replay.unknown[0].log.payload, "player1"), false);
  });

  it("does not map a live event id through provider_match_id", () => {
    const canon = canonicalLiveFrame({
      source: "replay",
      seq: 1,
      id: "4242",
      status: "Finished",
      score: "6-0,6-0",
      winnerId: "101",
    });
    const mapped = mapFrameToMatch(canon.frame, catalog);
    assert.equal(mapped.status, "not_found");
  });
});

describe("game score", () => {
  const match = catalog.matches[0];
  const GAME = new Set(["0", "15", "30", "40", "A", "AD"]);

  it("reads points and ignores prototype game-score names", () => {
    const row = canonicalLiveFrame({
      id: "7000001",
      matchId: "101-202-9001-1",
      status: "InPlay",
      score: "7-6,1-1",
      points: "15-15",
      currentGameScore: "40-0",
      completedSets: "6-0",
      receivedAt: "2026-10-07T12:22:22.507Z",
    });
    assert.equal(row.frame.points, "15-15");
    assert.equal(row.frame.score, "7-6,1-1");
    const projected = projectLiveFrame(null, { frame: row.frame, match });
    assert.equal(projected.state.score_text, "7-6,1-1");
    assert.equal(projected.state.points_text, "15-15");
    assert.equal(Object.hasOwn(projected.state, "tiebreak"), false);
    assert.equal(canonicalGame("40-A"), "40-AD");
    assert.equal(Number.isInteger(Number("AD")), false);

    const prototypeOnly = canonicalLiveFrame({
      id: "7000001",
      matchId: "101-202-9001-1",
      status: "InPlay",
      score: "7-6,1-1",
      currentGameScore: "40-0",
      completedSets: "6-0",
      receivedAt: "2026-10-07T12:22:22.507Z",
    });
    assert.equal(prototypeOnly.frame.points, null);

    const duplicated = projectLiveFrame(null, {
      frame: canonicalLiveFrame({
        id: "7000001",
        matchId: "101-202-9001-1",
        status: "InPlay",
        score: "5-2",
        points: "5-2",
        receivedAt: "2026-10-07T12:22:22.507Z",
      }).frame,
      match,
    });
    assert.equal(duplicated.state.score_text, "5-2");
    assert.equal(duplicated.state.points_text, null);
    assert.equal(Object.hasOwn(duplicated.state, "tiebreak"), false);
  });

  it("classifies captured points as a tennis game or a duplicated set", { skip: m1CaptureSkip(root) }, () => {
    const paths = [
      path.join(root, "captures", "live-raw.ndjson"),
      path.join(root, "fixtures", "live-capture-oct-2026", "frames.ndjson"),
    ].filter((file) => existsSync(file));
    assert.ok(paths.length > 0, "capture file missing");
    for (const file of paths) {
      for (const row of liveRowsFromNdjson(readFileSync(file, "utf8"))) {
        if (row.points == null) continue;
        const parts = String(row.points).trim().split("-");
        const tennis = parts.length === 2 && GAME.has(parts[0]) && GAME.has(parts[1]);
        if (tennis) {
          const game = canonicalGame(row.points);
          assert.equal(typeof game, "string");
          for (const token of game.split("-")) {
            assert.ok(["0", "15", "30", "40", "AD"].includes(token));
          }
        } else {
          assert.equal(String(row.points), String(row.score));
          assert.equal(canonicalGame(row.points), null);
        }
      }
    }
  });
});

describe("stored provider captures", () => {
  it("normalizes M1 live lists without a settlement patch", { skip: m1CaptureSkip(root) }, () => {
    const paths = [
      path.join(root, "captures", "live-raw.ndjson"),
      path.join(root, "fixtures", "live-capture-oct-2026", "frames.ndjson"),
    ].filter((file) => existsSync(file));
    assert.ok(paths.length > 0, "M1 capture file missing");
    for (const file of paths) {
      const rows = liveRowsFromNdjson(readFileSync(file, "utf8"));
      assert.ok(rows.length > 0, file);
      for (const row of rows) {
        const canon = canonicalLiveFrame(row);
        assert.equal(canon.ok, true, file);
        assert.equal(canon.frame.servingProviderId, null);
        const projected = projectLiveFrame(null, {
          frame: canon.frame,
          match: { ...catalog.matches[0], officially_settled: false },
        });
        assert.equal(projected.officialPatch, null);
        assert.equal(projected.advance, false);
        if (projected.action === "apply") {
          assert.equal(liveStateRow(projected.state).winner_player_id, undefined);
        }
      }
    }
  });
});

describe("live trust boundary", () => {
  it("does not name a settlement writer", () => {
    const files = [
      path.join(root, "packages", "provider-rapidapi", "src", "live-frame.js"),
      path.join(root, "packages", "provider-rapidapi", "src", "live-normalize.js"),
      path.join(root, "scripts", "replay-live.mjs"),
      path.join(root, "packages", "provider-rapidapi", "src", "live-replay-harness.js"),
      path.join(root, "apps", "web", "components", "live", "LiveMatchLayer.tsx"),
      path.join(root, "apps", "web", "lib", "live", "patch.ts"),
    ];
    const forbidden = [
      "settleAll",
      "apply_grades",
      "apply_bracket_state",
      "advanceWinnerToParent",
      "mergeSettledFact",
      "claim_settlement",
      'from("matches")',
      "winner_side",
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const name of forbidden) {
        assert.equal(text.includes(name), false, `${file} mentions ${name}`);
      }
    }
  });
});

describe("provider clock order", () => {
  const match = {
    match_id: "m-1",
    match_key: "r0-m0",
    public_ref: "mx-1",
    tournament_id: "t-1",
    tournament_provider_id: "9001",
    side_a_provider_id: "101",
    side_b_provider_id: "202",
  };

  function frameAt(updatedAt, receivedAt, score) {
    return canonicalLiveFrame({
      id: "7000001",
      matchId: "101-202-9001-1",
      status: "InPlay",
      score,
      points: "15-0",
      updatedAt,
      receivedAt,
    }).frame;
  }

  it("does not move backward when a later receipt has an older clock", () => {
    const stored = {
      sequence: 100,
      sequence_source: "updatedAt",
      frame_key: "stored",
      occurred_at: "2026-10-09T18:00:01.000Z",
      received_at: "2026-10-09T18:00:02.000Z",
      score_text: "6-4",
    };
    const older = projectLiveFrame(stored, {
      frame: frameAt("2026-10-09T18:00:00.000Z", "2026-10-09T19:00:00.000Z", "0-0"),
      match,
    });
    assert.equal(older.action, "ignored");
    assert.equal(older.state.score_text, "6-4");
    assert.equal(older.state.occurred_at, "2026-10-09T18:00:01.000Z");
    assert.equal(older.state.received_at, "2026-10-09T18:00:02.000Z");
  });

  it("treats an equal provider clock as a no-op when the frame arrives later", () => {
    const stored = {
      sequence: 100,
      sequence_source: "updatedAt",
      frame_key: "stored",
      occurred_at: "2026-10-09T18:00:01.000Z",
      received_at: "2026-10-09T18:00:02.000Z",
      score_text: "6-4",
      phase: "in_play",
    };
    const sameInstant = frameAt(
      "2026-10-09T14:00:01.000-04:00",
      "2026-10-09T19:30:00.000Z",
      "6-0,6-0"
    );
    sameInstant.sequence = 900;
    const decision = projectLiveFrame(stored, { frame: sameInstant, match });
    assert.equal(Date.parse(sameInstant.occurred_at), Date.parse(stored.occurred_at));
    assert.equal(decision.action, "ignored");
    assert.equal(decision.state.score_text, "6-4");
    assert.equal(decision.state.phase, "in_play");
    assert.equal(decision.state.occurred_at, stored.occurred_at);
    assert.equal(decision.state.received_at, stored.received_at);
  });

  it("accepts a newer provider clock even when the sequence is lower", () => {
    const stored = {
      sequence: 9_000,
      sequence_source: "updatedAt",
      frame_key: "stored",
      occurred_at: "2026-10-09T18:00:01.000Z",
      received_at: "2026-10-09T18:00:02.000Z",
    };
    const ahead = frameAt("2026-10-09T18:05:00.000Z", "2026-10-09T18:00:01.000Z", "6-4,3-3");
    ahead.sequence = 1;
    const newer = projectLiveFrame(stored, { frame: ahead, match });
    assert.equal(newer.action, "apply");
    assert.equal(newer.state.score_text, "6-4,3-3");
    assert.equal(newer.state.occurred_at, "2026-10-09T18:05:00.000Z");
    assert.equal(newer.state.received_at, "2026-10-09T18:00:01.000Z");
  });
});

describe("side resolution", () => {
  const match = {
    match_id: "m-1",
    match_key: "r0-m0",
    public_ref: "mx-1",
    tournament_id: "t-1",
    side_a_provider_id: "101",
    side_b_provider_id: "202",
    side_a_ref: "p-a",
    side_b_ref: "p-b",
  };

  function inPlay(servingProviderId) {
    const frame = canonicalLiveFrame({
      id: "7000001",
      matchId: "101-202-9001-1",
      status: "InPlay",
      score: "6-4",
      points: "15-0",
      updatedAt: "2026-10-09T18:00:00.000Z",
      receivedAt: "2026-10-09T18:00:01.000Z",
    }).frame;
    frame.servingProviderId = servingProviderId;
    return frame;
  }

  it("maps each provider id to one side", () => {
    const sides = resolvePlayerSides(match);
    assert.equal(providerSide(sides, "101"), "a");
    assert.equal(providerSide(sides, "202"), "b");
    assert.equal(providerSide(sides, "999"), null);
    assert.equal(providerSide(sides, null), null);
    const served = projectLiveFrame(null, { frame: inPlay("202"), match });
    assert.equal(served.state.serving_side, "b");
  });

  it("leaves serving null when the two sides are not distinct", () => {
    for (const broken of [
      { ...match, side_b_provider_id: "101" },
      { ...match, side_b_provider_id: null },
      { ...match, side_a_provider_id: "" },
    ]) {
      assert.equal(resolvePlayerSides(broken), null);
      const served = projectLiveFrame(null, { frame: inPlay("101"), match: broken });
      assert.equal(served.state.serving_side, null);
    }
  });
});

describe("provider socket gate", () => {
  it("stays closed without a captured handshake", () => {
    assert.equal(providerSocketEnabled({}), false);
    assert.throws(() => openProviderSocket({}), /provider socket is off/);
    assert.throws(
      () => openProviderSocket({ MATCHREAD_LIVE_SOCKET: "1" }),
      /handshake is not captured/
    );
  });
});
