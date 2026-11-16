// Fix list P2-7: the league home leads with the right tournament and the
// viewer's hour, not the server's.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickCurrentTournament } from "./current-tournament.ts";
import { hourInZone, validTimeZone } from "../tournaments/viewer-zone-cookie.ts";

const rows = [
  { tournament_id: "finished", starts_on: "2026-10-01", ends_on: "2026-10-07" },
  { tournament_id: "later", starts_on: "2026-12-01", ends_on: "2026-12-07" },
  { tournament_id: "next", starts_on: "2026-11-20", ends_on: "2026-11-26" },
  { tournament_id: "older", starts_on: "2026-09-01", ends_on: "2026-09-07" },
];

describe("pickCurrentTournament", () => {
  it("prefers the event in progress", () => {
    const live = [...rows, { tournament_id: "now", starts_on: "2026-11-14", ends_on: "2026-11-20" }];
    assert.equal(pickCurrentTournament(live, "2026-11-16"), "now");
  });
  it("then the next to start, not the first row returned", () => {
    assert.equal(pickCurrentTournament(rows, "2026-11-16"), "next");
  });
  it("then the most recently finished", () => {
    assert.equal(pickCurrentTournament(rows.slice(0, 1).concat(rows[3]), "2026-11-16"), "finished");
  });
  it("is null with no rows", () => {
    assert.equal(pickCurrentTournament([], "2026-11-16"), null);
  });
});

describe("viewer zone", () => {
  it("computes the hour in the viewer's zone", () => {
    const at = new Date("2026-11-16T03:30:00Z");
    assert.equal(hourInZone("UTC", at), 3);
    assert.equal(hourInZone("America/New_York", at), 22);
    assert.equal(hourInZone("Asia/Tokyo", at), 12);
  });
  it("rejects zones Intl does not know", () => {
    assert.equal(validTimeZone("Europe/Madrid"), "Europe/Madrid");
    assert.equal(validTimeZone("Not/AZone"), null);
    assert.equal(validTimeZone(""), null);
    assert.equal(validTimeZone(undefined), null);
  });
});
