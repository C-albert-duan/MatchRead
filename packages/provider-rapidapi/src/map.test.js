import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDrawFromFirstRound,
  firstMainDrawBall,
  mapResultsToIngest,
  normalizeTour,
  parseFixtureInstant,
  resolveNationalBankOpenWeek,
} from "./index.js";

describe("normalizeTour", () => {
  it("defaults unknown to atp", () => {
    assert.equal(normalizeTour(undefined), "atp");
    assert.equal(normalizeTour("ATP"), "atp");
    assert.equal(normalizeTour("wta"), "wta");
  });
});

describe("resolveNationalBankOpenWeek", () => {
  it("finds Montreal ATP and Toronto WTA", () => {
    const week = resolveNationalBankOpenWeek({
      atp: {
        tournaments: [
          { id: 21346, name: "National Bank Open - Montreal", date: "2026-08-03T00:00:00.000Z" },
          { id: 1, name: "Other" },
        ],
      },
      wta: {
        tournaments: [
          { id: 16739, name: "National Bank Open - Toronto", date: "2026-08-03T00:00:00.000Z" },
        ],
      },
    });
    assert.deepEqual(week.montreal, {
      tour: "atp",
      provider_tournament_id: "21346",
      name: "National Bank Open - Montreal",
      starts_on: "2026-08-03",
    });
    assert.deepEqual(week.toronto, {
      tour: "wta",
      provider_tournament_id: "16739",
      name: "National Bank Open - Toronto",
      starts_on: "2026-08-03",
    });
  });
});

describe("parseFixtureInstant", () => {
  it("keeps a real clock from an ISO datetime", () => {
    const parsed = parseFixtureInstant({
      date: "2026-08-11T18:30:00.000Z",
    });
    assert.equal(parsed?.has_time, true);
    assert.equal(parsed?.scheduled_at, "2026-08-11T18:30:00.000Z");
  });

  it("does not invent midnight as a kickoff", () => {
    const parsed = parseFixtureInstant({ date: "2026-08-11T00:00:00.000Z" });
    assert.equal(parsed?.has_time, false);
    assert.equal(parsed?.scheduled_at, "2026-08-11T00:00:00.000Z");
  });

  it("joins a date and a clock", () => {
    const parsed = parseFixtureInstant({ date: "2026-08-11", time: "14:05" });
    assert.equal(parsed?.has_time, true);
    assert.equal(parsed?.scheduled_at, "2026-08-11T14:05:00.000Z");
  });

  it("date-only is a day, not a time", () => {
    const parsed = parseFixtureInstant({ date: "2026-08-11" });
    assert.equal(parsed?.has_time, false);
    assert.equal(parsed?.scheduled_at, "2026-08-11T12:00:00.000Z");
  });
});

describe("firstMainDrawBall", () => {
  it("uses the earliest timed First and ignores qualifying", () => {
    const ball = firstMainDrawBall([
      { round: { name: "Qualifying" }, date: "2026-08-09T15:00:00.000Z" },
      { round: { name: "First" }, date: "2026-08-13T19:00:00.000Z" },
      { round: { name: "First" }, date: "2026-08-13T17:00:00.000Z" },
      { round: { name: "First" }, date: "2026-08-13" },
    ]);
    assert.equal(ball?.scheduled_at, "2026-08-13T17:00:00.000Z");
  });

  it("does not invent a lock from date-only first-round rows", () => {
    assert.equal(
      firstMainDrawBall([{ round: { name: "First" }, date: "2026-08-13" }]),
      null
    );
  });

  it("does not use a later round as first ball", () => {
    assert.equal(
      firstMainDrawBall([
        { round: { name: "Quarterfinals" }, date: "2026-08-14T17:00:00.000Z" },
      ]),
      null
    );
  });
});

function firstMatch(id, a, b) {
  return {
    id,
    round: { name: "First" },
    player1Id: a.id,
    player2Id: b.id,
    player1: { id: a.id, name: a.name, countryAcr: "USA" },
    player2: { id: b.id, name: b.name, countryAcr: "ESP" },
    date: "2026-08-13T17:00:00.000Z",
  };
}

describe("buildDrawFromFirstRound", () => {
  it("fails closed on a partial first round", () => {
    const fixtures = [];
    for (let i = 0; i < 20; i++) {
      fixtures.push(
        firstMatch(1000 + i, { id: i * 2 + 1, name: `Ada One${i}` }, { id: i * 2 + 2, name: `Bo Two${i}` })
      );
    }
    const built = buildDrawFromFirstRound(fixtures, { prefix: "atp" });
    assert.equal(built.ok, false);
    if (built.ok) throw new Error("expected fail");
    assert.match(built.reason, /incomplete first round \(20/);
  });

  it("publishes a 64-draw when all 32 first-round pairs are named", () => {
    const fixtures = [];
    for (let i = 0; i < 32; i++) {
      fixtures.push(
        firstMatch(
          2000 + i,
          { id: 100 + i, name: `PlayerA ${i} Smith` },
          { id: 200 + i, name: `PlayerB ${i} Jones` }
        )
      );
    }
    fixtures.push({
      id: 9,
      round: { name: "Qualifying" },
      player1Id: 1,
      player2Id: 2,
      player1: { id: 1, name: "Qual One" },
      player2: { id: 2, name: "Qual Two" },
      date: "2026-08-09T15:00:00.000Z",
    });
    const built = buildDrawFromFirstRound(fixtures, { prefix: "atp" });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error(built.reason);
    assert.equal(built.drawSize, 64);
    assert.equal(built.seats.length, 64);
    assert.equal(built.seats.every((s) => s.provider_player_id && s.last_name), true);
    assert.equal(built.seats[0].player_ref, "atp-100");
    assert.equal(built.matches["2000"], "r0-m0");
    assert.equal(built.schedule.length, 32);
  });
});

describe("mapResultsToIngest", () => {
  const mapping = {
    tournament_id: "00000000-0000-0000-0000-000000000001",
    provider_tournament_id: "21346",
    players: { "28170": "p-0", "29939": "p-1" },
    matches: { "1244910": "r0-m0", "999": "r0-m1" },
  };

  it("maps winner via match_winner", () => {
    const { results, skipped } = mapResultsToIngest(
      [
        {
          id: "1244910",
          match_winner: 28170,
          result: "6-2 2-0 ret.",
          result_type: "retired",
        },
      ],
      mapping
    );
    assert.equal(skipped.length, 0);
    assert.deepEqual(results, [
      { match_key: "r0-m0", winner_ref: "p-0", voided: false },
    ]);
  });

  it("skips unmapped match ids", () => {
    const { results, skipped } = mapResultsToIngest(
      [{ id: "nope", match_winner: 28170, result_type: "completed" }],
      mapping
    );
    assert.equal(results.length, 0);
    assert.equal(skipped[0].reason, "no match_key mapping");
  });

  it("voids walkover without winner", () => {
    const { results, skipped } = mapResultsToIngest(
      [{ id: "999", result_type: "walkover" }],
      mapping
    );
    assert.equal(skipped.length, 0);
    assert.deepEqual(results, [
      { match_key: "r0-m1", winner_ref: null, voided: true },
    ]);
  });
});
