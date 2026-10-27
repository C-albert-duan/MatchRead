import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { derivePointFlags, setsToWinFor, type PointFlagInput } from "./point-flag.ts";

/**
 * Supported formats are sets-to-win 2 or 3, and game tokens 0, 15, 30, 40, AD.
 * A finished 7-6 or 6-7 set is a set, not a tie-break point score.
 * Anything else is null.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function flags(partial: Partial<PointFlagInput> = {}) {
  return derivePointFlags({
    oriented: true,
    sets: "6-4,3-3",
    game: "15-15",
    serving: "a",
    setsToWin: 2,
    ...partial,
  });
}

const GAME: Record<string, string> = { "0": "0", "15": "15", "30": "30", "40": "40", A: "AD", AD: "AD" };

function canonicalGame(points: unknown): string | null {
  if (points == null || points === "") return null;
  const parts = String(points).trim().split("-");
  if (parts.length !== 2) return null;
  const left = GAME[parts[0]];
  const right = GAME[parts[1]];
  if (!left || !right) return null;
  return `${left}-${right}`;
}

function rowsFrom(file: string): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const line of readFileSync(file, "utf8").split(/\n/)) {
    if (!line.trim()) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.matchId != null) {
      rows.push(record);
      continue;
    }
    const body = typeof record.payload === "string" ? record.payload : record.body_text;
    if (typeof body !== "string") continue;
    let parsed: { results?: unknown };
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed.results)) continue;
    for (const row of parsed.results) {
      if (row && typeof row === "object") rows.push(row as Record<string, unknown>);
    }
  }
  return rows;
}

/** Gitignored M1 captures. A fresh clone (CI) has none, so the captured-score test skips. */
const M1_CAPTURES = [
  path.join(root, "captures", "live-raw.ndjson"),
  path.join(root, "fixtures", "live-capture-oct-2026", "frames.ndjson"),
];
const capturesSkip = M1_CAPTURES.some((file) => existsSync(file))
  ? false
  : "gitignored M1 captures not on disk";

function capturedRows(): Array<Record<string, unknown>> {
  const files = [
    ...M1_CAPTURES,
    path.join(root, "fixtures", "live-replay", "TIMELINE.ndjson"),
    path.join(root, "fixtures", "live-replay", "chaos.ndjson"),
  ].filter((file) => existsSync(file));
  assert.ok(files.length >= 2, "live score fixtures missing");
  return files.flatMap(rowsFrom);
}

describe("normal game", () => {
  it("is null while neither side is one point from the game", () => {
    for (const game of ["0-0", "15-0", "0-15", "15-15", "30-0", "0-30", "30-15", "15-30", "30-30"]) {
      assert.equal(flags({ game, serving: "a" }), null, game);
      assert.equal(flags({ game, serving: "b", setsToWin: 3 }), null, game);
    }
  });
});

describe("deuce", () => {
  it("is null at 40-40", () => {
    assert.equal(flags({ game: "40-40", serving: "a" }), null);
    assert.equal(flags({ game: "40-40", serving: "b", sets: "6-4,5-4" }), null);
  });
});

describe("advantage", () => {
  it("gives the server the game point and not the break", () => {
    assert.equal(flags({ sets: "2-2", game: "AD-40", serving: "a" }), null);
    assert.equal(flags({ sets: "2-2", game: "40-AD", serving: "b" }), null);
    const match = flags({ sets: "6-3,5-4", game: "AD-40", serving: "a" });
    assert.ok(match);
    assert.equal(match.breakPoint, null);
    assert.equal(match.matchPoint, "a");
  });

  it("gives the receiver the break", () => {
    const held = flags({ sets: "2-3", game: "40-AD", serving: "a" });
    assert.ok(held);
    assert.equal(held.breakPoint, "b");
    assert.equal(held.matchPoint, null);
    const other = flags({ sets: "3-2", game: "AD-40", serving: "b" });
    assert.ok(other);
    assert.equal(other.breakPoint, "a");
    assert.equal(other.matchPoint, null);
  });
});

describe("break point", () => {
  it("covers each receiver score on either side", () => {
    const forB = ["0-40", "15-40", "30-40", "40-AD"];
    const forA = ["40-0", "40-15", "40-30", "AD-40"];
    for (const game of forB) {
      const result = flags({ sets: "6-4,3-3", game, serving: "a" });
      assert.ok(result, game);
      assert.equal(result.breakPoint, "b", game);
      assert.equal(result.matchPoint, null, game);
    }
    for (const game of forA) {
      const result = flags({ sets: "6-4,3-3", game, serving: "b" });
      assert.ok(result, game);
      assert.equal(result.breakPoint, "a", game);
      assert.equal(result.matchPoint, null, game);
    }
  });
});

describe("tie-break", () => {
  it("does not invent a tie-break point from a 6-6 set or a finished 7-6", () => {
    assert.equal(flags({ sets: "6-6", game: "0-40", serving: "a" }), null);
    assert.equal(flags({ sets: "7-6", game: "0-40", serving: "b" }), null);
    assert.equal(flags({ sets: "6-4,6-7", game: "15-40", serving: "a" }), null);
    const next = flags({ sets: "7-6,2-2", game: "15-40", serving: "a" });
    assert.ok(next);
    assert.equal(next.breakPoint, "b");
    assert.equal(Object.hasOwn(next, "tiebreak"), false);
  });
});

describe("set-ending state", () => {
  it("is a match point only when that set also wins the match", () => {
    assert.equal(flags({ sets: "5-4", game: "40-0", serving: "a" }), null);
    const receiverSet = flags({ sets: "4-5", game: "0-40", serving: "a" });
    assert.ok(receiverSet);
    assert.equal(receiverSet.breakPoint, "b");
    assert.equal(receiverSet.matchPoint, null);
    assert.equal(flags({ sets: "6-5", game: "30-40", serving: "a" }).matchPoint, null);
    const seven = flags({ sets: "6-4,6-5", game: "40-30", serving: "a" });
    assert.ok(seven);
    assert.equal(seven.matchPoint, "a");
    assert.equal(seven.breakPoint, null);
  });
});

describe("match-point state", () => {
  it("uses sets-to-win 2 and 3", () => {
    const three = flags({ sets: "6-4,5-3", game: "40-15", serving: "b" });
    assert.ok(three);
    assert.equal(three.matchPoint, "a");
    assert.equal(three.breakPoint, "a");
    const fiveEarly = flags({ sets: "6-4,5-3", game: "40-15", serving: "b", setsToWin: 3 });
    assert.ok(fiveEarly);
    assert.equal(fiveEarly.matchPoint, null);
    assert.equal(fiveEarly.breakPoint, "a");
    const five = flags({ sets: "6-4,3-6,6-3,5-4", game: "AD-40", serving: "b", setsToWin: 3 });
    assert.ok(five);
    assert.equal(five.matchPoint, "a");
    assert.equal(five.breakPoint, "a");
  });
});

describe("underivable state", () => {
  it("returns null for an unparseable score", () => {
    for (const game of ["5-2", "3-2", "40-A", "40-30-15", "", "7-6(5)"]) {
      assert.equal(flags({ game }), null, game);
    }
    assert.equal(flags({ sets: "6-4, 5-4", game: "40-0" }), null);
    assert.equal(flags({ sets: null, game: "40-0" }), null);
    assert.equal(flags({ game: null }), null);
  });

  it("returns null for an unknown format when no break is known", () => {
    assert.equal(flags({ sets: "6-4,5-4", game: "40-0", serving: null, setsToWin: null }), null);
    const typed = derivePointFlags({
      oriented: true,
      sets: "6-4,5-4",
      game: "40-0",
      serving: "b",
      setsToWin: 4 as PointFlagInput["setsToWin"],
    });
    assert.ok(typed);
    assert.equal(typed.matchPoint, null);
    assert.equal(typed.breakPoint, "a");
    assert.equal(
      derivePointFlags({
        oriented: true,
        sets: "6-4,5-4",
        game: "40-0",
        serving: "a",
        setsToWin: 4 as PointFlagInput["setsToWin"],
      }),
      null
    );
  });

  it("drops the break when the server is missing and keeps a proven match point", () => {
    const result = flags({ sets: "6-4,5-4", game: "40-0", serving: null });
    assert.ok(result);
    assert.equal(result.breakPoint, null);
    assert.equal(result.matchPoint, "a");
    assert.equal(flags({ sets: "3-3", game: "0-40", serving: null }), null);
  });

  it("returns null for a malformed provider state", () => {
    assert.equal(flags({ oriented: false, sets: "6-4,5-4", game: "40-0", serving: "b" }), null);
    assert.equal(flags({ sets: "5-4,6-4", game: "40-0" }), null);
    assert.equal(flags({ sets: "6-4,6-4,5-4", game: "40-0" }), null);
    assert.equal(flags({ sets: "5-2", game: "5-2" }), null);
  });
});

describe("captured scores", () => {
  it("uses the captured game and set shapes and does not guess the rest", { skip: capturesSkip }, () => {
    const rows = capturedRows();
    assert.ok(rows.length > 0);
    const games = new Set<string>();
    const scores = new Set<string>();
    for (const row of rows) {
      const game = canonicalGame(row.points);
      if (game) games.add(game);
      if (typeof row.score === "string") scores.add(row.score);
      const rawGame = row.points == null ? null : String(row.points);
      const rawSets = row.score == null ? null : String(row.score);
      assert.equal(
        derivePointFlags({
          oriented: false,
          sets: rawSets,
          game: game ?? rawGame,
          serving: null,
          setsToWin: null,
        }),
        null
      );
      if (game == null && rawGame != null) {
        assert.equal(rawGame, rawSets);
        assert.equal(flags({ sets: rawSets, game: rawGame }), null);
      }
    }
    for (const game of ["0-0", "40-40", "40-AD", "AD-40", "0-40", "15-40", "30-40", "40-0"]) {
      assert.equal(games.has(game), true, game);
    }
    assert.equal([...scores].some((score) => /(^|,)(7-6|6-7)(,|$)/.test(score)), true);
  });
});

describe("match format from the tournament row", () => {
  it("is best of five only for men's Grand Slam singles", () => {
    assert.equal(setsToWinFor("atp", "grand_slam"), 3);
    assert.equal(setsToWinFor("wta", "grand_slam"), 2);
    assert.equal(setsToWinFor("atp", "masters_1000"), 2);
    assert.equal(setsToWinFor("wta", "tour_250"), 2);
  });

  it("is unknown without a tour or a tier", () => {
    assert.equal(setsToWinFor(null, "grand_slam"), null);
    assert.equal(setsToWinFor("atp", null), null);
    assert.equal(setsToWinFor("itf", "itf"), null);
  });
});
