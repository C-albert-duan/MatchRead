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

test("p-0 fixture refs are fiction; UUIDs are not", () => {
  assert.equal(isFictionalSeatRef("p-0"), true);
  assert.equal(isFictionalSeatRef("p-15"), true);
  assert.equal(
    isFictionalSeatRef("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    false
  );
});

test("a 16-draw of fictional p-N player_ids is not official", () => {
  const seats: DrawSeat[] = Array.from({ length: 16 }, (_, i) => ({
    position: i,
    kind: "player" as const,
    player_id: `p-${i}`,
    last_name: "Aldecoa",
    seed: null,
    country_code: "ESP",
  }));
  assert.equal(isOfficialPublicDraw(seats, 16), false);
});

test("named seats + byes of correct size are official", () => {
  const seats: DrawSeat[] = [
    {
      position: 0,
      kind: "player",
      player_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      last_name: "Norrie",
      seed: 1,
      country_code: "GBR",
    },
    {
      position: 1,
      kind: "bye",
      player_id: null,
      last_name: "",
      seed: null,
      country_code: "",
    },
    {
      position: 2,
      kind: "player",
      player_id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
      last_name: "De Minaur",
      seed: 2,
      country_code: "AUS",
    },
    {
      position: 3,
      kind: "tbd",
      player_id: null,
      last_name: "",
      seed: null,
      country_code: "",
      tbd_label: "Qualifier",
    },
  ];
  assert.equal(isOfficialPublicDraw(seats, 4), true);
});
