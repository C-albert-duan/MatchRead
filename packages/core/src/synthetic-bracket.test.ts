import assert from "node:assert/strict";
import { test } from "node:test";
import { totalMatches } from "./bracket.ts";
import { buildSyntheticBracket16 } from "./synthetic-bracket.ts";

test("synthetic 16-draw is a stored tree, not a replay of scores", () => {
  const sheet = buildSyntheticBracket16();
  assert.equal(sheet.drawSize, 16);
  assert.equal(sheet.players.length, 16);
  assert.equal(sheet.seats.length, 16);
  assert.equal(sheet.matches.length, totalMatches(16));

  const byKey = new Map(sheet.matches.map((match) => [match.key, match]));
  const first = byKey.get("r0-m0");
  const night = byKey.get("r0-m1");
  const dateOnly = byKey.get("r0-m2");
  const tba = byKey.get("r0-m3");
  const parent = byKey.get("r1-m0");
  assert.ok(first && night && dateOnly && tba && parent);

  assert.equal(first.session, "day");
  assert.equal(first.court, "Court 1");
  assert.equal(first.hasTime, true);
  assert.equal(first.winnerRef, "syn16-p01");
  assert.equal(first.feeds, "r1-m0");

  assert.equal(night.session, "night");
  assert.equal(night.court, "Court 2");
  assert.equal(night.winnerRef, "syn16-p04");

  assert.equal(dateOnly.hasTime, false);
  assert.ok(dateOnly.scheduledAt);
  assert.equal(tba.scheduledAt, null);
  assert.equal(tba.session, null);
  assert.equal(tba.court, null);

  assert.deepEqual(parent.feeders, ["r0-m0", "r0-m1"]);
  assert.equal(parent.sideARef, first.winnerRef);
  assert.equal(parent.sideBRef, night.winnerRef);
  assert.equal(parent.winnerRef, null);
  assert.equal(parent.officialScore, null);

  const refs = sheet.matches.map((match) => match.externalRef);
  assert.equal(new Set(refs).size, refs.length);
  assert.ok(refs.every((ref) => !ref.includes("-") || !/^[0-9a-f-]{36}$/i.test(ref)));
  assert.equal(sheet.matches.find((match) => match.round === 3)?.feeds, null);
});
