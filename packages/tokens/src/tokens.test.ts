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
  assert.equal(color.canvas, "#FFFFFF");
});

test("cssVariables emits the new colours under --mr-* names", () => {
  const css = cssVariables();
  assert.match(css, /--mr-ball: #D9F35A/);
  assert.match(css, /--mr-ball-edge: #C4DE3F/);
  assert.match(css, /--mr-court-hard: #2F6FA8/);
  assert.match(css, /--mr-data: #0A6B42/);
  assert.equal(rootStyle().startsWith(":root"), true);
});
