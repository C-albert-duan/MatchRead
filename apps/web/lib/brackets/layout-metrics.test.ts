import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  BRACKET_SLOT_GAP_PX,
  R0_MATCH_FOOT_MAX_PX,
  bracketSlotHeightPx,
  gradedEditorFootStackPx,
  r0CellHeightPx,
  r0SlotCenterSpanPx,
  scheduledFootStackPx,
  settledOfficialFootStackPx,
  withdrawalFootStackPx,
} from "./layout-metrics.ts";

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(
  join(here, "../../app/globals.css"),
  "utf8"
);

function cssVar(name: string): string | null {
  const m = globalsCss.match(new RegExp(`${name}:\\s*([^;\\n]+)`));
  return m?.[1]?.trim() ?? null;
}

test("settled official metadata used to exceed the old 48px R0 gap (overlap bug)", () => {
  const stack = settledOfficialFootStackPx();
  assert.ok(
    stack > 48,
    `stack ${stack}px must exceed legacy pair-out gap to document the bug`
  );
  assert.ok(
    stack <= R0_MATCH_FOOT_MAX_PX,
    `foot reserve ${R0_MATCH_FOOT_MAX_PX}px must fit settled stack ${stack}px`
  );
});

test("R0 foot reserve fits editor and withdrawal stacks", () => {
  const stacks = [
    gradedEditorFootStackPx(),
    withdrawalFootStackPx(),
    scheduledFootStackPx(),
  ];
  for (const stack of stacks) {
    assert.ok(
      stack <= R0_MATCH_FOOT_MAX_PX,
      `foot reserve must fit ${stack}px stack`
    );
  }
});

test("R0 cell height separates slot centers by slot + foot + gap", () => {
  const slotH = bracketSlotHeightPx();
  const cellH = r0CellHeightPx();
  assert.equal(cellH, slotH + R0_MATCH_FOOT_MAX_PX);
  const span = r0SlotCenterSpanPx();
  assert.equal(span, cellH + BRACKET_SLOT_GAP_PX);
});

test("globals.css keeps --match-foot-max aligned with layout-metrics", () => {
  const raw = cssVar("--match-foot-max");
  assert.ok(raw, "--match-foot-max must be defined");
  assert.match(raw!, /88px/, "CSS foot reserve must match R0_MATCH_FOOT_MAX_PX");
});

test("globals.css R0 connector math includes match-foot-max", () => {
  assert.match(
    globalsCss,
    /var\(--slot-h\)\s*\+\s*var\(--slot-gap\)\s*\+\s*var\(--match-foot-max\)/,
    "odd R0 elbow height must span slot centers across the foot band"
  );
  assert.match(
    globalsCss,
    /var\(--match-foot-max\)\s*\+\s*var\(--slot-h\)\s*\/\s*2/,
    "even R0 elbow must offset for the foot band below the slot"
  );
});
