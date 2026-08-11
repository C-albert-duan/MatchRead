import assert from "node:assert/strict";
import { test } from "node:test";
import { color, cssVariables, rootStyle } from "./index.ts";

test("ball yellow tokens exist", () => {
  assert.equal(color.ball, "#D9F35A");
  assert.equal(color.ballEdge, "#C4DE3F");
});

test("hard court is not the accent / CTA colour", () => {
  assert.equal(color.courtHard, "#2F6FA8");
  assert.equal(color.accent, "#15181B");
  assert.notEqual(color.courtHard, color.accent);
});

test("verified fact is Tournament Green, not mint", () => {
  assert.equal(color.data, "#0A6B42");
  assert.equal(color.inverse, "#053D26");
  assert.notEqual(color.canvas, "#FFFFFF");
});

test("the room is lawn paper; cards sit on it as cream", () => {
  assert.equal(color.canvas, "#E8F1EB");
  assert.equal(color.card, "#FBFDFA");
});

test("cssVariables emits the new colours under --mr-* names", () => {
  const css = cssVariables();
  assert.match(css, /--mr-ball: #D9F35A/);
  assert.match(css, /--mr-ball-edge: #C4DE3F/);
  assert.match(css, /--mr-court-hard: #2F6FA8/);
  assert.match(css, /--mr-data: #0A6B42/);
  assert.match(css, /--mr-card: #FBFDFA/);
  assert.match(css, /--mr-canvas: #E8F1EB/);
  assert.equal(rootStyle().startsWith(":root"), true);
});
