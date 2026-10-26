/**
 * Break point and match point from canonical tennis state.
 * Left of `sets` and `game` is side a. Right is side b.
 * A 6-6 set has no captured tie-break points, so it produces no flag.
 * No provider label is read.
 */

import type { LivePointFlags, ServingSide, SetsToWin } from "./state.ts";

const GAME = new Set(["0", "15", "30", "40", "AD"]);

export type PointFlagInput = {
  /** Left of the score is side a only when this is true. */
  oriented: boolean;
  sets: string | null;
  game: string | null;
  serving: ServingSide | null;
  setsToWin: SetsToWin | null;
};

function pair(text: string): [number, number] | null {
  const parts = text.split("-");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
  return [Number(parts[0]), Number(parts[1])];
}

/** Completed set winner. 7-6 counts. 6-6 does not. */
export function setWinner(games: [number, number]): "a" | "b" | null {
  const [a, b] = games;
  if (a >= 6 && a - b >= 2) return "a";
  if (b >= 6 && b - a >= 2) return "b";
  if (a === 7 && b === 6) return "a";
  if (b === 7 && a === 6) return "b";
  return null;
}

function gamePointSide(game: string): ServingSide | null {
  if (!/^(0|15|30|40|AD)-(0|15|30|40|AD)$/.test(game)) return null;
  const parts = game.split("-");
  if (parts.length !== 2 || !GAME.has(parts[0]) || !GAME.has(parts[1])) return null;
  const [left, right] = parts;
  if (left === "AD" && right === "40") return "a";
  if (right === "AD" && left === "40") return "b";
  if (left === "40" && (right === "0" || right === "15" || right === "30")) return "a";
  if (right === "40" && (left === "0" || left === "15" || left === "30")) return "b";
  return null;
}

function gameWinsSet(open: [number, number], side: ServingSide): boolean {
  const [a, b] = open;
  if (a === 6 && b === 6) return false;
  const next: [number, number] = side === "a" ? [a + 1, b] : [a, b + 1];
  return setWinner(next) === side;
}

/**
 * Break point and match point, or null when the state is not enough.
 * Null is the result for an ambiguous format, a malformed game, an
 * unoriented score, or a 6-6 set. A break point also stays null when the
 * server is unknown.
 * A match point is set only for sets-to-win 2 or 3, and only when that
 * side has not already won the match.
 */
export function derivePointFlags(input: PointFlagInput): LivePointFlags | null {
  if (input.oriented !== true) return null;
  if (!input.sets || !input.game) return null;
  if (!/^\d+-\d+(,\d+-\d+)*$/.test(input.sets)) return null;
  const sets = input.sets.split(",").map(pair);
  if (sets.some((item) => item == null)) return null;
  const games = sets as [number, number][];
  const winners = games.map(setWinner);
  const openAt = winners.findIndex((winner) => winner == null);
  if (openAt === -1 || openAt !== winners.length - 1) return null;

  const side = gamePointSide(input.game);
  if (!side) return null;
  const open = games[openAt];
  if (open[0] === 6 && open[1] === 6) return null;

  const format = input.setsToWin === 2 || input.setsToWin === 3 ? input.setsToWin : null;
  const heldBy = (mark: "a" | "b") => winners.filter((winner) => winner === mark).length;
  if (format != null && (heldBy("a") >= format || heldBy("b") >= format)) return null;

  const breakPoint = input.serving == null || input.serving === side ? null : side;
  const matchPoint =
    format != null && gameWinsSet(open, side) && heldBy(side) + 1 >= format ? side : null;
  if (breakPoint == null && matchPoint == null) return null;
  return { breakPoint, matchPoint };
}
