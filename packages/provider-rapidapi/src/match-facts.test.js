import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMatchCourt, parseMatchSession } from "./match-facts.js";

test("session is copied only from an explicit day or night field", () => {
  assert.equal(parseMatchSession({ session: "Day" }), "day");
  assert.equal(parseMatchSession({ dayNight: "night session" }), "night");
  assert.equal(parseMatchSession({ session: "unknown" }), null);
  assert.equal(parseMatchSession({ startTime: "2026-08-10T02:00:00Z" }), null);
  assert.equal(parseMatchSession({ startTimestamp: 1750000000 }), null);
  assert.equal(parseMatchSession({ dateOnly: "2026-10-07" }), null);
  assert.equal(parseMatchSession({ hour: "21:00" }), null);
  assert.equal(parseMatchSession({}), null);
});

test("match court is a published label, not the event surface", () => {
  assert.equal(parseMatchCourt({ courtName: "Court 1" }), "Court 1");
  assert.equal(parseMatchCourt({ courtNumber: 12 }), "12");
  assert.equal(parseMatchCourt({ court: "Centre" }), "Centre");
  assert.equal(parseMatchCourt({ court: { name: "Hard" } }), null);
  assert.equal(parseMatchCourt({ court: "clay" }), null);
  assert.equal(parseMatchCourt({ court: "I.hard" }), null);
  assert.equal(parseMatchCourt({ surface: "grass" }), null);
  assert.equal(
    parseMatchCourt({
      id: 2123,
      tournament: { court: { id: 2, name: "Clay" }, courtId: 2 },
    }),
    null
  );
  assert.equal(parseMatchCourt({}), null);
});
