import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partitionLandingCalendar, type LandingEvent } from "./landing.ts";

function event(
  partial: Partial<LandingEvent> & Pick<LandingEvent, "id">
): LandingEvent {
  return {
    tour: "atp",
    hasDraw: true,
    starts_on: null,
    lock_at: null,
    ...partial,
  };
}

const now = new Date("2026-08-14T18:00:00.000Z");

describe("partitionLandingCalendar", () => {
  it("puts a locked in-play draw on court, not upcoming", () => {
    const cin = event({
      id: "cin",
      starts_on: "2026-08-10",
      lock_at: "2026-08-13T18:10:00.000Z",
    });
    const { openNow, onCourt, upcoming } = partitionLandingCalendar([cin], now);
    assert.deepEqual(openNow.map((e) => e.id), []);
    assert.deepEqual(onCourt.map((e) => e.id), ["cin"]);
    assert.deepEqual(upcoming.map((e) => e.id), []);
  });

  it("puts an unlocked future draw in Open now", () => {
    const uso = event({
      id: "uso",
      starts_on: "2026-08-31",
      lock_at: "2026-08-30T15:00:00.000Z",
    });
    const { openNow, onCourt, upcoming } = partitionLandingCalendar([uso], now);
    assert.deepEqual(openNow.map((e) => e.id), ["uso"]);
    assert.deepEqual(onCourt.map((e) => e.id), []);
    assert.deepEqual(upcoming.map((e) => e.id), []);
  });

  it("puts a not-started pending draw in Upcoming", () => {
    const wsal = event({
      id: "wsal",
      hasDraw: false,
      starts_on: "2026-08-24",
      lock_at: null,
    });
    const { openNow, onCourt, upcoming } = partitionLandingCalendar(
      [wsal],
      now
    );
    assert.deepEqual(openNow.map((e) => e.id), []);
    assert.deepEqual(onCourt.map((e) => e.id), []);
    assert.deepEqual(upcoming.map((e) => e.id), ["wsal"]);
  });
});
