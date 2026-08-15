import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isFictionalSeatName,
  isFictionalSeatRef,
  isOfficialPublicDraw,
  type DrawSeat,
} from "./bracket.ts";

test("Player47 names are fiction; real surnames are not", () => {
  assert.equal(isFictionalSeatName("Player47"), true);
  assert.equal(isFictionalSeatName("Aldecoa"), false);
});

test("p-0 fixture refs are fiction; cin-2-norrie is not", () => {
  assert.equal(isFictionalSeatRef("p-0"), true);
  assert.equal(isFictionalSeatRef("p-15"), true);
  assert.equal(isFictionalSeatRef("cin-2-norrie"), false);
  assert.equal(isFictionalSeatRef("p-norrie"), false);
});

test("a 16-draw of Aldecoa / p-0 seats is not an official public draw", () => {
  const seats: DrawSeat[] = Array.from({ length: 16 }, (_, i) => ({
    position: i,
    player_ref: `p-${i}`,
    last_name: "Aldecoa",
    seed: null,
    country_code: "ESP",
    is_bye: false,
  }));
  assert.equal(isOfficialPublicDraw(seats, 16), false);
});
