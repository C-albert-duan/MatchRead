import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { normalizePairKey } from "./event-mapper.js";
import { parseMatchId } from "./live.js";
import { liveRowsFromNdjson, orientScoreText } from "./live-frame.js";
import { normalizeCapturedFrame } from "./live-normalize.js";
import { m1CaptureSkip } from "./live-replay-harness.js";

const root = path.resolve(import.meta.dirname, "../../..");
const catalog = JSON.parse(
  readFileSync(path.join(root, "fixtures", "live-replay", "catalog.json"), "utf8")
);

const captured = {
  id: "7000001",
  matchId: "101-202-9001-1",
  status: "InPlay",
  score: "6-4,3-3",
  points: "40-A",
  indicator: "1,0",
  updatedAt: "2026-10-07T12:22:20.000Z",
  receivedAt: "2026-10-07T12:22:22.507Z",
};

describe("captured frame to canonical live state", () => {
  it("reads the observed shape and resolves the pair onto MatchRead sides", () => {
    const result = normalizeCapturedFrame(captured, catalog);
    assert.equal(result.ok, true);
    assert.equal(result.state.matchId, "m-1");
    assert.equal(result.state.tournamentId, "t-1");
    assert.equal(result.state.publicRef, "mx-1");
    assert.equal(result.state.phase, "in_play");
    assert.equal(result.state.sets, "6-4,3-3");
    assert.equal(result.state.game, "40-AD");
    assert.equal(result.state.serving, null);
    assert.equal(result.state.flag, "live");
    assert.equal(result.state.pointFlags, null);
    assert.equal(result.state.provisionalWinner, null);
    assert.equal(result.state.occurredAt, "2026-10-07T12:22:20.000Z");
    assert.equal(result.state.receivedAt, "2026-10-07T12:22:22.507Z");
    assert.equal(result.state.showScore, undefined);
    assert.equal(result.advance, undefined);
    assert.equal(result.officialPatch, undefined);
  });

  it("returns unmapped, ambiguous, unknown status, or already official", () => {
    assert.equal(
      normalizeCapturedFrame({ ...captured, matchId: "303-404-9001-1" }, catalog).reason,
      "unmapped"
    );
    const twin = {
      ...catalog,
      matches: [
        catalog.matches[0],
        { ...catalog.matches[0], match_id: "m-2", public_ref: "mx-2" },
      ],
    };
    assert.equal(normalizeCapturedFrame(captured, twin).reason, "ambiguous");
    assert.equal(
      normalizeCapturedFrame({ ...captured, status: "Mystery" }, catalog).reason,
      "unknown status"
    );
    const settled = {
      ...catalog,
      matches: [{ ...catalog.matches[0], officially_settled: true }],
    };
    const official = normalizeCapturedFrame(captured, settled);
    assert.equal(official.ok, false);
    assert.equal(official.reason, "already official");
    assert.equal(official.state, undefined);
  });

  it("uses a harness winner id only as a provisional side ref", () => {
    const result = normalizeCapturedFrame(
      {
        source: "replay",
        seq: 8,
        replayPhase: "terminal",
        replayWinnerId: "202",
        id: "evt-live-1",
        matchId: "101-202-9001-1",
        status: "InPlay",
        score: "6-3,6-4",
        indicator: "1,0",
        receivedAt: "2026-10-09T16:10:00.000Z",
      },
      catalog
    );
    assert.equal(result.ok, true);
    assert.equal(result.state.phase, "provisional_final");
    assert.equal(result.state.flag, "provisional");
    assert.equal(result.state.serving, null);
    assert.equal(result.state.provisionalWinner, "p-b");
    assert.equal(result.state.pointFlags, null);
    assert.equal(Object.hasOwn(result.state, "winner_side"), false);
    assert.equal(Object.hasOwn(result.state, "winner_player_id"), false);
    assert.equal(result.state.occurredAt, null);
    assert.equal(result.state.game, null);
    const inPlay = normalizeCapturedFrame(
      {
        source: "replay",
        seq: 2,
        replayPhase: "in_play",
        replayWinnerId: "202",
        id: "evt-live-1",
        matchId: "101-202-9001-1",
        status: "InPlay",
        score: "6-4",
        receivedAt: "2026-10-09T16:00:00.000Z",
      },
      catalog
    );
    assert.equal(inPlay.ok, true);
    assert.equal(inPlay.state.provisionalWinner, null);
  });

  it("does not query, settle, or format", () => {
    const source = readFileSync(new URL("./live-normalize.js", import.meta.url), "utf8");
    for (const word of ["supabase", "settleAll", "fetch(", "showScore", "node:fs", "Date.now"]) {
      assert.equal(source.includes(word), false, word);
    }
  });
});

const POINT = { 0: "0", 15: "15", 30: "30", 40: "40", A: "AD", AD: "AD" };
const SETTLEMENT = [
  "winner_side",
  "winner_player_id",
  "winner_ref",
  "official_score",
  "settled_at",
  "voided",
  "advance",
  "officialPatch",
];

function expectedGame(points) {
  if (points == null || points === "") return null;
  const parts = String(points).trim().split("-");
  if (parts.length !== 2) return null;
  const left = POINT[parts[0]];
  const right = POINT[parts[1]];
  if (!left || !right) return null;
  return `${left}-${right}`;
}

function expectedSets(score) {
  if (score == null || score === "") return null;
  const parts = String(score).split(",");
  if (!parts.every((part) => /^\d+-\d+$/.test(part))) return null;
  return parts.join(",");
}

function shapeOf(row) {
  const sets = row.score == null ? [] : String(row.score).split(",");
  const points = expectedGame(row.points) ? "tennis" : row.points == null ? "null" : "other";
  const indicator = row.indicator == null ? "null" : String(row.indicator);
  const tie = sets.some((part) => part === "7-6" || part === "6-7") ? "tie-set" : "plain";
  return [
    Object.hasOwn(row, "updatedAt") ? "clock" : "no-clock",
    points,
    `ind-${indicator}`,
    `sets-${sets.length}`,
    tie,
    String(row.status),
  ].join("|");
}

function catalogFrom(rows) {
  const first = new Map();
  for (const row of rows) {
    const parsed = parseMatchId(row.matchId);
    const key = `${normalizePairKey(parsed.player1Id, parsed.player2Id)}|${parsed.tournamentId}`;
    if (!first.has(key)) first.set(key, parsed);
  }
  const matches = [...first.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .map(([, parsed], index) => ({
      match_id: `m-${index}`,
      match_key: `r0-m${index}`,
      public_ref: `mx-${index}`,
      tournament_id: `t-${parsed.tournamentId}`,
      tournament_provider_id: String(parsed.tournamentId),
      side_a_provider_id: String(parsed.player1Id),
      side_b_provider_id: String(parsed.player2Id),
      side_a_ref: "p-a",
      side_b_ref: "p-b",
      officially_settled: false,
    }));
  return { matches, eventMap: [] };
}

function pairKey(row) {
  const parsed = parseMatchId(row.matchId);
  return `${normalizePairKey(parsed.player1Id, parsed.player2Id)}|${parsed.tournamentId}`;
}

function flipped(catalog) {
  return {
    eventMap: catalog.eventMap,
    matches: catalog.matches.map((match) => ({
      ...match,
      side_a_provider_id: match.side_b_provider_id,
      side_b_provider_id: match.side_a_provider_id,
      side_a_ref: match.side_b_ref,
      side_b_ref: match.side_a_ref,
    })),
  };
}

function assertNoSettlement(result) {
  assert.equal(result.officialPatch, undefined);
  assert.equal(result.advance, undefined);
  for (const key of SETTLEMENT) {
    assert.equal(Object.hasOwn(result, key), false, key);
    if (result.state) assert.equal(Object.hasOwn(result.state, key), false, key);
  }
}

function withoutClock(run) {
  const RealDate = globalThis.Date;
  const originalFetch = globalThis.fetch;
  let bareClock = 0;
  let fetches = 0;
  function GuardedDate(...args) {
    if (args.length === 0) bareClock += 1;
    return new RealDate(...args);
  }
  GuardedDate.parse = RealDate.parse;
  GuardedDate.UTC = RealDate.UTC;
  GuardedDate.now = () => {
    bareClock += 1;
    return 0;
  };
  globalThis.Date = GuardedDate;
  globalThis.fetch = () => {
    fetches += 1;
    throw new Error("network");
  };
  try {
    return { value: run(), bareClock, fetches };
  } finally {
    globalThis.Date = RealDate;
    globalThis.fetch = originalFetch;
  }
}

function capturedRows() {
  const files = [
    path.join(root, "captures", "live-raw.ndjson"),
    path.join(root, "fixtures", "live-capture-oct-2026", "frames.ndjson"),
  ];
  for (const file of files) assert.equal(existsSync(file), true, file);
  return files.flatMap((file) => liveRowsFromNdjson(readFileSync(file, "utf8")));
}

describe("I5 normalizer fixtures", () => {
  it("normalizes every distinct captured shape to the same state", { skip: m1CaptureSkip(root) }, () => {
    const rows = capturedRows();
    const catalog = catalogFrom(rows);
    const reverse = flipped(catalog);
    const shapes = new Set(rows.map(shapeOf));
    for (const marker of [
      "clock|",
      "no-clock|",
      "|tennis|",
      "|other|",
      "|null|",
      "|ind-0,1|",
      "|ind-1,0|",
      "|ind-0,0|",
      "|ind-null|",
      "|sets-1|",
      "|sets-2|",
      "|sets-3|",
      "|tie-set|",
      "|InPlay",
    ]) {
      assert.equal([...shapes].some((shape) => shape.includes(marker)), true, marker);
    }

    const guarded = withoutClock(() => ({
      once: rows.map((row) => normalizeCapturedFrame(row, catalog)),
      twice: rows.map((row) => normalizeCapturedFrame(row, catalog)),
      swapped: rows.map((row) => normalizeCapturedFrame(row, reverse)),
    }));
    assert.equal(guarded.bareClock, 0);
    assert.equal(guarded.fetches, 0);
    assert.equal(guarded.value.once instanceof Promise, false);
    assert.deepEqual(guarded.value.once, guarded.value.twice);

    const seen = new Map();
    const clocks = new Map();
    let breakShaped = 0;
    guarded.value.once.forEach((result, index) => {
      const row = rows[index];
      const shape = shapeOf(row);
      assert.equal(result.ok, true, shape);
      assert.equal(result instanceof Promise, false);
      assertNoSettlement(result);
      const state = result.state;
      assert.equal(state.phase, "in_play", shape);
      assert.equal(state.flag, "live", shape);
      assert.equal(state.pointFlags, null, shape);
      assert.equal(state.serving, null, shape);
      assert.equal(state.provisionalWinner, null, shape);
      assert.equal(state.sets, expectedSets(row.score), shape);
      assert.equal(state.game, expectedGame(row.points), shape);
      assert.equal(state.receivedAt, row.receivedAt, shape);
      if (typeof row.updatedAt === "number") {
        assert.equal(state.occurredAt, new Date(row.updatedAt).toISOString(), shape);
      } else {
        assert.equal(state.occurredAt, null, shape);
      }
      const key = pairKey(row);
      const prior = seen.get(key);
      const identity = {
        matchId: state.matchId,
        tournamentId: state.tournamentId,
        publicRef: state.publicRef,
      };
      if (prior) assert.deepEqual(identity, prior, shape);
      else seen.set(key, identity);
      const other = guarded.value.swapped[index];
      assert.equal(other.ok, true, shape);
      assert.equal(other.state.matchId, state.matchId, shape);
      // Swapped sides read the same frame from the other side.
      assert.equal(other.state.sets, orientScoreText(state.sets, "swap"), shape);
      assert.equal(other.state.game, orientScoreText(state.game, "swap"), shape);
      assert.equal(other.state.serving, null, shape);
      if (state.game && /^(40-(0|15|30)|AD-40|(0|15|30)-40|40-AD)$/.test(state.game)) {
        breakShaped += 1;
        assert.equal(state.pointFlags, null, shape);
      }
      if (typeof row.updatedAt === "number") {
        const list = clocks.get(state.matchId) || [];
        list.push({ updatedAt: row.updatedAt, occurredAt: state.occurredAt });
        clocks.set(state.matchId, list);
      }
    });
    assert.ok(breakShaped > 0);
    for (const list of clocks.values()) {
      const ordered = [...list].sort((left, right) => left.updatedAt - right.updatedAt);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = Date.parse(ordered[index - 1].occurredAt);
        const current = Date.parse(ordered[index].occurredAt);
        if (ordered[index].updatedAt > ordered[index - 1].updatedAt) {
          assert.ok(current > previous);
        } else {
          assert.equal(current, previous);
        }
      }
    }
  });

  it("normalizes the prototype timeline in receipt order", () => {
    const lines = liveRowsFromNdjson(
      readFileSync(path.join(root, "fixtures", "live-replay", "TIMELINE.ndjson"), "utf8")
    );
    const expected = [
      { sets: "1-0", game: "15-0", flag: "live", winner: null },
      { sets: "1-0", game: "30-0", flag: "live", winner: null },
      { sets: "0-0", game: "0-0", flag: "live", winner: null },
      { sets: "1-0", game: "30-0", flag: "live", winner: null },
      { sets: "6-4,1-1", game: "0-15", flag: "live", winner: null },
      { sets: "6-4,0-0", game: "0-0", flag: "live", winner: null },
      { sets: "6-4,6-2", game: null, flag: "provisional", winner: "p-a" },
    ];
    const guarded = withoutClock(() => ({
      once: lines.map((line) => normalizeCapturedFrame(line, catalog)),
      twice: lines.map((line) => normalizeCapturedFrame(line, catalog)),
    }));
    assert.equal(guarded.bareClock, 0);
    assert.equal(guarded.fetches, 0);
    assert.deepEqual(guarded.value.once, guarded.value.twice);
    assert.equal(guarded.value.once.length, expected.length);
    guarded.value.once.forEach((result, index) => {
      assert.equal(result.ok, true);
      assertNoSettlement(result);
      const state = result.state;
      assert.equal(state.matchId, "m-1");
      assert.equal(state.tournamentId, "t-1");
      assert.equal(state.publicRef, "mx-1");
      assert.equal(state.serving, null);
      assert.equal(state.pointFlags, null);
      assert.equal(state.occurredAt, null);
      assert.equal(state.receivedAt, lines[index].receivedAt);
      assert.equal(state.sets, expected[index].sets);
      assert.equal(state.game, expected[index].game);
      assert.equal(state.flag, expected[index].flag);
      assert.equal(state.provisionalWinner, expected[index].winner);
      assert.equal(state.phase, expected[index].flag === "provisional" ? "provisional_final" : "in_play");
      if (index > 0) {
        assert.ok(Date.parse(state.receivedAt) > Date.parse(guarded.value.once[index - 1].state.receivedAt));
      }
    });
  });
});
