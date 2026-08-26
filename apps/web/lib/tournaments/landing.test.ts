import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  partitionLandingCalendar,
  UPCOMING_MAX,
  type LandingEvent,
} from "./landing.ts";

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

  it("keeps finished draws out of all buckets even without lock_at", () => {
    const done = event({
      id: "chacabuco",
      starts_on: "2026-07-28",
      lock_at: null,
    });
    const { openNow, onCourt, upcoming } = partitionLandingCalendar(
      [done],
      now
    );
    assert.deepEqual(openNow.map((e) => e.id), []);
    assert.deepEqual(onCourt.map((e) => e.id), []);
    assert.deepEqual(upcoming.map((e) => e.id), []);
  });

  it("hides a started draw with no lock_at (not Open, not On court)", () => {
    const astana = event({
      id: "astana",
      starts_on: "2026-08-10",
      lock_at: null,
    });
    const { openNow, onCourt, upcoming } = partitionLandingCalendar(
      [astana],
      now
    );
    assert.deepEqual(openNow.map((e) => e.id), []);
    assert.deepEqual(onCourt.map((e) => e.id), []);
    assert.deepEqual(upcoming.map((e) => e.id), []);
  });

  it("keeps a started draw in Open while a real lock_at is still ahead", () => {
    const late = event({
      id: "late-fill",
      starts_on: "2026-08-10",
      lock_at: "2026-08-16T15:00:00.000Z",
    });
    const { openNow, onCourt, upcoming } = partitionLandingCalendar(
      [late],
      now
    );
    assert.deepEqual(openNow.map((e) => e.id), ["late-fill"]);
    assert.deepEqual(onCourt.map((e) => e.id), []);
    assert.deepEqual(upcoming.map((e) => e.id), []);
  });

  it("does not put a locked draw on court before the week starts", () => {
    const earlyLock = event({
      id: "early-lock",
      starts_on: "2026-08-20",
      lock_at: "2026-08-13T18:00:00.000Z",
    });
    const { openNow, onCourt, upcoming } = partitionLandingCalendar(
      [earlyLock],
      now
    );
    assert.deepEqual(openNow.map((e) => e.id), []);
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

  it("excludes a started draw-pending event from Upcoming", () => {
    const started = event({
      id: "asuncion",
      hasDraw: false,
      starts_on: "2026-08-10",
      lock_at: null,
    });
    const { openNow, onCourt, awaitingDraw, upcoming } =
      partitionLandingCalendar([started], now);
    assert.deepEqual(openNow.map((e) => e.id), []);
    assert.deepEqual(onCourt.map((e) => e.id), []);
    assert.deepEqual(awaitingDraw.map((e) => e.id), ["asuncion"]);
    assert.deepEqual(upcoming.map((e) => e.id), []);
  });

  it("caps Upcoming to the next few by start date", () => {
    const many = Array.from({ length: UPCOMING_MAX + 4 }, (_, i) =>
      event({
        id: `u${i}`,
        hasDraw: false,
        starts_on: `2026-08-${String(20 + i).padStart(2, "0")}`,
        lock_at: null,
      })
    );
    const { upcoming } = partitionLandingCalendar(many, now);
    assert.equal(upcoming.length, UPCOMING_MAX);
    assert.deepEqual(
      upcoming.map((e) => e.id),
      Array.from({ length: UPCOMING_MAX }, (_, i) => `u${i}`)
    );
  });

  it("drops Upcoming beyond the horizon even if not started", () => {
    const far = event({
      id: "far",
      hasDraw: false,
      starts_on: "2026-10-01",
      lock_at: null,
    });
    const { upcoming } = partitionLandingCalendar([far], now);
    assert.deepEqual(upcoming.map((e) => e.id), []);
  });
});
