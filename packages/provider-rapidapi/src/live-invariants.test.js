/**
 * I5, I6, and I7. Seeded cases, no extra test library.
 * I5 calls normalizeCapturedFrame. I6 and I7 call acceptForwardedLive.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { normalizeCapturedFrame } from "./live-normalize.js";
import {
  createReplayAdmin,
  liveRows,
  replayThroughIngest,
  seedReplayCatalog,
} from "./live-replay-harness.js";

const root = path.resolve(import.meta.dirname, "../../..");
const catalog = JSON.parse(
  readFileSync(path.join(root, "fixtures", "live-replay", "catalog.json"), "utf8")
);

const SEED = 77;
const GAMES = ["0", "15", "30", "40", "AD"];
const MATCH_ID = "101-202-9001-1";
const EVENT_ID = "evt-live-1";
const START_MS = Date.parse("2026-10-09T15:00:00.000Z");

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function setScore(rng) {
  const count = 1 + Math.floor(rng() * 3);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(`${Math.floor(rng() * 8)}-${Math.floor(rng() * 8)}`);
  }
  return parts.join(",");
}

function gameScore(rng) {
  return `${pick(rng, GAMES)}-${pick(rng, GAMES)}`;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function reorderKeys(value, rng) {
  const keys = Object.keys(value);
  const ordered = rng() < 0.5 ? [...keys].sort() : [...keys].sort().reverse();
  /** @type {Record<string, unknown>} */
  const copy = {};
  for (const key of ordered) copy[key] = value[key];
  return copy;
}

function rawEvent(rng) {
  const mapped = rng() < 0.75;
  const source = pick(rng, ["replay", "rest", "socket"]);
  /** @type {Record<string, unknown>} */
  const event = {
    source,
    id: mapped ? EVENT_ID : `evt-${Math.floor(rng() * 40)}`,
    matchId: mapped ? MATCH_ID : `${Math.floor(rng() * 9)}-${Math.floor(rng() * 9)}-9001-1`,
    status: pick(rng, ["InPlay", "Finished", ""]),
    score: rng() < 0.8 ? setScore(rng) : pick(rng, ["", "6-4, 1-1", "x"]),
    points: rng() < 0.8 ? gameScore(rng) : pick(rng, ["3-2", "", "A-15"]),
    receivedAt: iso(START_MS + Math.floor(rng() * 3_600_000)),
    noise: Math.floor(rng() * 1000),
  };
  if (source === "replay") {
    event.seq = Math.floor(rng() * 30);
    event.replayPhase = pick(rng, ["in_play", "suspended", "terminal", "nope"]);
    if (event.replayPhase === "terminal") {
      event.replayWinnerId = pick(rng, ["101", "999"]);
    }
  } else if (rng() < 0.5) {
    event.updatedAt = Date.parse(String(event.receivedAt)) - 1000;
  }
  return event;
}

function replayFrame(rng, seq) {
  const phase = pick(rng, ["in_play", "suspended", "terminal"]);
  /** @type {Record<string, unknown>} */
  const event = {
    source: "replay",
    seq,
    id: EVENT_ID,
    matchId: MATCH_ID,
    status: "InPlay",
    replayPhase: phase,
    score: setScore(rng),
    points: phase === "terminal" ? null : gameScore(rng),
    receivedAt: iso(START_MS + seq * 1000),
  };
  if (phase === "terminal") event.replayWinnerId = pick(rng, ["101", "202", "999"]);
  return event;
}

function restFrame(rng, updatedAt) {
  return {
    source: "rest",
    id: EVENT_ID,
    matchId: MATCH_ID,
    status: "InPlay",
    score: setScore(rng),
    points: gameScore(rng),
    updatedAt,
    receivedAt: iso(updatedAt + 5),
  };
}

function officialSheet(admin) {
  return structuredClone({
    matches: admin.tables.matches,
    seats: admin.tables.seats,
    brackets: admin.tables.brackets,
  });
}

function attachOfficialSheet(admin, scored) {
  const match = admin.tables.matches[0];
  if (scored) {
    match.winner_player_id = "pl-101";
    match.settled_at = "2026-10-09T00:00:00.000Z";
    match.official_score = "6-4,6-3";
  }
  admin.tables.seats = [
    {
      tournament_id: "t-1",
      position: 0,
      kind: "player",
      player_id: "pl-101",
      seed: 1,
      entry: null,
      tbd_label: null,
    },
    {
      tournament_id: "t-1",
      position: 1,
      kind: "player",
      player_id: "pl-202",
      seed: null,
      entry: null,
      tbd_label: null,
    },
  ];
  admin.tables.brackets = [
    {
      id: "br-1",
      league_id: "lg-1",
      tournament_id: "t-1",
      user_id: "user-1",
      submitted_at: "2026-10-09T12:00:00.000Z",
      points: scored ? 18 : null,
      rank: scored ? 2 : null,
      champion_player_id: scored ? "pl-101" : null,
    },
  ];
}

async function seededPlay(frames, scored = false) {
  const admin = createReplayAdmin();
  seedReplayCatalog(admin, catalog);
  attachOfficialSheet(admin, scored);
  const before = officialSheet(admin);
  await replayThroughIngest(admin, frames, []);
  return { admin, before };
}

describe("live invariants", () => {
  it("I5 same raw event and catalog return the same canonical state", () => {
    const rng = mulberry32(SEED);
    for (let i = 0; i < 40; i += 1) {
      const event = rawEvent(rng);
      const context = structuredClone(catalog);
      const first = normalizeCapturedFrame(event, context);
      const second = normalizeCapturedFrame(event, context);
      const cloned = normalizeCapturedFrame(structuredClone(event), structuredClone(catalog));
      const reordered = normalizeCapturedFrame(reorderKeys(event, rng), structuredClone(catalog));
      assert.deepEqual(second, first, `I5 repeat ${i}`);
      assert.deepEqual(cloned, first, `I5 clone ${i}`);
      assert.deepEqual(reordered, first, `I5 key order ${i}`);
    }
  });

  it("I6 duplicate frames leave matches, seats, and brackets unchanged", async () => {
    const rng = mulberry32(SEED + 1);
    for (let i = 0; i < 12; i += 1) {
      const scored = i % 2 === 0;
      const count = 2 + Math.floor(rng() * 3);
      const frames = [];
      for (let n = 0; n < count; n += 1) frames.push(replayFrame(rng, n + 1));
      const { admin, before } = await seededPlay(frames, scored);
      assert.equal(admin.tables.seats.length, 2, `I6 seats ${i}`);
      assert.equal(admin.tables.brackets.length, 1, `I6 brackets ${i}`);
      assert.deepEqual(officialSheet(admin), before, `I6 first pass ${i}`);
      const duplicates = frames.map((frame, index) => ({
        ...frame,
        receivedAt: iso(START_MS + 86_400_000 + index),
      }));
      await replayThroughIngest(admin, [...frames, ...duplicates], []);
      assert.deepEqual(officialSheet(admin), before, `I6 duplicate pass ${i}`);
      const liveAfter = liveRows(admin);

      const once = await seededPlay(frames, scored);
      const twice = await seededPlay([...frames, ...duplicates], scored);
      assert.deepEqual(officialSheet(twice.admin), officialSheet(once.admin), `I6 pair ${i}`);
      assert.deepEqual(liveRows(twice.admin), liveAfter, `I6 live pair ${i}`);
      assert.deepEqual(liveRows(once.admin), liveAfter, `I6 live once ${i}`);
    }
  });

  it("I7 an older frame cannot roll the live row backward", async () => {
    const rng = mulberry32(SEED + 2);
    for (let i = 0; i < 12; i += 1) {
      const count = 3 + Math.floor(rng() * 3);
      const frames = [];
      let seq = 1 + Math.floor(rng() * 20);
      for (let n = 0; n < count; n += 1) {
        seq += 1 + Math.floor(rng() * 5);
        frames.push(replayFrame(rng, seq));
      }
      const ordered = await seededPlay(frames, false);
      const expected = liveRows(ordered.admin);
      const sheet = officialSheet(ordered.admin);
      assert.equal(expected.length, 1, `I7 row ${i}`);
      assert.equal(expected[0].sequence, frames[frames.length - 1].seq, `I7 tip ${i}`);

      const permuted = await seededPlay(shuffle(frames, rng), false);
      assert.deepEqual(liveRows(permuted.admin), expected, `I7 order ${i}`);
      assert.deepEqual(officialSheet(permuted.admin), sheet, `I7 sheet ${i}`);

      await replayThroughIngest(ordered.admin, [...frames].reverse(), []);
      assert.deepEqual(liveRows(ordered.admin), expected, `I7 rewind ${i}`);
      assert.deepEqual(officialSheet(ordered.admin), sheet, `I7 rewind sheet ${i}`);
    }

    const restRng = mulberry32(SEED + 3);
    for (let i = 0; i < 8; i += 1) {
      const frames = [];
      let updatedAt = START_MS + i * 3_600_000;
      const count = 3 + Math.floor(restRng() * 2);
      for (let n = 0; n < count; n += 1) {
        updatedAt += 60_000 + Math.floor(restRng() * 60_000);
        frames.push(restFrame(restRng, updatedAt));
      }
      const ordered = await seededPlay(frames, false);
      const expected = liveRows(ordered.admin);
      assert.equal(expected.length, 1, `I7 rest row ${i}`);
      assert.equal(expected[0].sequence, frames[frames.length - 1].updatedAt, `I7 rest tip ${i}`);
      const permuted = await seededPlay(shuffle(frames, restRng), false);
      assert.deepEqual(liveRows(permuted.admin), expected, `I7 rest order ${i}`);
      await replayThroughIngest(ordered.admin, [...frames].reverse(), []);
      assert.deepEqual(liveRows(ordered.admin), expected, `I7 rest rewind ${i}`);
      assert.deepEqual(officialSheet(ordered.admin), officialSheet(permuted.admin), `I7 rest sheet ${i}`);
    }
  });
});
