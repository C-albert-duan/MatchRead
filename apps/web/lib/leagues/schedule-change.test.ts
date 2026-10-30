import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseLeagueSlug,
  parseScheduleChange,
  scheduleErrorCode,
  scheduleStatusFrom,
} from "./schedule-change.ts";

describe("parseScheduleChange", () => {
  it("accepts a league slug and a tournament ref", () => {
    assert.deepEqual(
      parseScheduleChange({ slug: "fourth-floor-1a2b3c4d", tournamentRef: "t-atp-21361" }),
      { slug: "fourth-floor-1a2b3c4d", tournamentRef: "t-atp-21361" }
    );
  });

  it("rejects UUIDs in either field", () => {
    const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
    assert.equal(parseScheduleChange({ slug: uuid, tournamentRef: "t-atp-1" }), null);
    assert.equal(parseScheduleChange({ slug: "league", tournamentRef: uuid }), null);
  });

  it("rejects missing, oversized and odd input", () => {
    assert.equal(parseScheduleChange(null), null);
    assert.equal(parseScheduleChange({ slug: "league" }), null);
    assert.equal(parseScheduleChange({ slug: "a".repeat(81), tournamentRef: "t-atp-1" }), null);
    assert.equal(parseScheduleChange({ slug: "League", tournamentRef: "t-atp-1" }), null);
    assert.equal(parseScheduleChange({ slug: "league", tournamentRef: "../x" }), null);
    assert.equal(parseLeagueSlug({ slug: 42 }), null);
  });
});

describe("scheduleErrorCode", () => {
  it("maps every DETAIL code", () => {
    for (const detail of [
      "unauthorized",
      "not_found",
      "tournament_locked",
      "tournament_ineligible",
      "single_tournament_league",
      "schedule_not_custom",
      "brackets_exist",
      "last_tournament",
    ]) {
      assert.equal(scheduleErrorCode({ code: "P0001", details: detail }), detail);
    }
  });

  it("falls back on SQLSTATE, never the message", () => {
    assert.equal(scheduleErrorCode({ code: "42501", details: null }), "unauthorized");
    assert.equal(scheduleErrorCode({ code: "P0002" }), "not_found");
    assert.equal(scheduleErrorCode({ code: "P0001", details: "something else" }), "unknown");
    assert.equal(scheduleErrorCode(null), "unknown");
  });
});

describe("scheduleStatusFrom", () => {
  it("reads known statuses only", () => {
    assert.equal(scheduleStatusFrom({ status: "already_added" }), "already_added");
    assert.equal(scheduleStatusFrom({ status: "nope" }), null);
    assert.equal(scheduleStatusFrom(null), null);
  });
});
