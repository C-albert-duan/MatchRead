/**
 * Consumer boundary — Sprint Directive 2.1 §5.
 * Homepage / calendar helpers must not treat ineligible rows as public.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partitionLandingCalendar } from "../lib/tournaments/landing.ts";

describe("consumer boundary", () => {
  it("empty Open leaves Upcoming as the named next event", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");
    const upcomingOnly = {
      id: "ws",
      tour: "atp" as const,
      hasDraw: false,
      starts_on: "2026-08-24",
      main_draw_starts_on: "2026-08-23",
      ends_on: "2026-08-29",
      lock_at: null,
    };
    const { openNow, upcoming } = partitionLandingCalendar(
      [upcomingOnly],
      now
    );
    assert.equal(openNow.length, 0);
    assert.equal(upcoming[0]?.id, "ws");
  });
});
