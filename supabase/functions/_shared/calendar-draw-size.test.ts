// Fix list P1-8: the calendar's draw-size guess never replaces a known size.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDrawSize } from "./calendar-draw-size.ts";

test("a new event takes the calendar guess", () => {
  assert.equal(calendarDrawSize(undefined, 128), 128);
  assert.equal(calendarDrawSize(undefined, null), null);
});

test("a known size is kept, even when the guess differs", () => {
  // A 56-player Masters must not flip back to the 128 guess.
  assert.equal(calendarDrawSize({ draw_size: 64, published_at: "2026-10-01T00:00:00Z" }, 128), 64);
  assert.equal(calendarDrawSize({ draw_size: 32, published_at: null }, 128), 32);
});

test("a row with no hint keeps its size instead of going null", () => {
  assert.equal(calendarDrawSize({ draw_size: 64, published_at: null }, null), 64);
});

test("a published draw with no size is not guessed", () => {
  assert.equal(calendarDrawSize({ draw_size: null, published_at: "2026-10-01T00:00:00Z" }, 128), null);
});

test("an unpublished row with no size takes the guess", () => {
  assert.equal(calendarDrawSize({ draw_size: null, published_at: null }, 32), 32);
});
