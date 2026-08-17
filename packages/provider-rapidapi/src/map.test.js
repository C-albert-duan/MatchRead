import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDrawFromFirstRound,
  firstMainDrawBall,
  mapLiveFinishedToIngest,
  mapResultsToIngest,
  normalizeTour,
  overlayOfficialDraw,
  parseOfficialDraw,
  parseFixtureInstant,
  resolveNationalBankOpenWeek,
} from "./index.js";
import { drawNameCandidates } from "./official/parse-draw.js";

function seat(position, overrides = {}) {
  const kind = overrides.seat_kind || (overrides.is_bye ? "bye" : "player");
  return {
    position,
    player_ref: overrides.player_ref ?? `p-${position}`,
    last_name: overrides.last_name ?? (kind === "bye" ? "Bye" : "Player"),
    given_name: overrides.given_name ?? null,
    seed: overrides.seed ?? null,
    country_code: overrides.country_code ?? "XXX",
    is_bye: kind === "bye",
    seat_kind: kind,
    entry_status: overrides.entry_status ?? null,
    provider_player_id: overrides.provider_player_id ?? null,
  };
}

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
    const built = buildDrawFromFirstRound(fixtures, { prefix: "atp", drawSize: 64 });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error(built.reason);
    assert.equal(built.drawSize, 64);
    assert.equal(built.seats.length, 64);
    assert.equal(built.seats.every((s) => s.provider_player_id && s.last_name), true);
    assert.equal(built.seats[0].player_ref, "atp-100");
    assert.equal(built.matches["2000"], "r0-m0");
    assert.equal(built.schedule.length, 32);
  });

  it("does not infer a 64-draw from 32 named pairs", () => {
    const fixtures = [];
    for (let i = 0; i < 32; i++) {
      fixtures.push(
        firstMatch(
          3000 + i,
          { id: 300 + i, name: `PlayerA ${i} Smith` },
          { id: 400 + i, name: `PlayerB ${i} Jones` }
        )
      );
    }
    const built = buildDrawFromFirstRound(fixtures, { prefix: "atp" });
    assert.equal(built.ok, false);
    if (built.ok) throw new Error("expected fail");
    assert.match(built.reason, /incomplete first round \(32/);
  });

  it("does not collapse 32 R128 pairs into a 128-draw", () => {
    const fixtures = [];
    for (let i = 0; i < 32; i++) {
      fixtures.push(
        firstMatch(
          4000 + i,
          { id: 500 + i, name: `PlayerA ${i} Smith` },
          { id: 600 + i, name: `PlayerB ${i} Jones` }
        )
      );
    }
    const built = buildDrawFromFirstRound(fixtures, {
      prefix: "atp",
      drawSize: 128,
    });
    assert.equal(built.ok, false);
    if (built.ok) throw new Error("expected fail");
    assert.match(built.reason, /official slots or 64 named slam pairs/);
  });
});

describe("overlayOfficialDraw", () => {
  it("maps provider ids onto official slots without reordering", () => {
    const seats = [
      seat(0, {
        last_name: "Cerundolo",
        given_name: "Francisco",
        player_ref: "p-fc",
        country_code: "ARG",
      }),
      seat(1, { seat_kind: "bye", player_ref: "bye-1" }),
      seat(2, {
        last_name: "Norrie",
        given_name: "Cameron",
        player_ref: "cin-2-norrie",
        country_code: "GBR",
      }),
      seat(3, {
        last_name: "Prizmic",
        given_name: "Dino",
        player_ref: "p-prizmic",
        country_code: "CRO",
      }),
      seat(4, {
        last_name: "Fucsovics",
        given_name: "Marton",
        player_ref: "p-fuc",
        country_code: "HUN",
      }),
      seat(5, {
        last_name: "Atmane",
        given_name: "Terence",
        player_ref: "p-atm",
        country_code: "FRA",
      }),
      seat(6, {
        last_name: "Cerundolo",
        given_name: "Juan",
        player_ref: "p-jmc",
        country_code: "ARG",
      }),
      seat(7, { seat_kind: "tbd", last_name: "Qualifier", player_ref: "tbd-7" }),
    ];
    const fixtures = [
      {
        id: 9001,
        round: { name: "First" },
        player1Id: 11,
        player2Id: 22,
        player1: { id: 11, name: "Cameron Norrie", countryAcr: "GBR" },
        player2: { id: 22, name: "Dino Prizmic", countryAcr: "CRO" },
        date: "2026-08-13T17:00:00.000Z",
      },
      {
        id: 9002,
        round: { name: "First" },
        player1Id: 31,
        player2Id: 32,
        player1: { id: 31, name: "Marton Fucsovics", countryAcr: "HUN" },
        player2: { id: 32, name: "Terence Atmane", countryAcr: "FRA" },
        date: "2026-08-13T19:00:00.000Z",
      },
      {
        id: 9003,
        round: { name: "First" },
        player1Id: 41,
        player2Id: 42,
        player1: { id: 41, name: "Francisco Cerundolo", countryAcr: "ARG" },
        player2: { id: 42, name: "Juan Manuel Cerundolo", countryAcr: "ARG" },
        date: "2026-08-14T17:00:00.000Z",
      },
    ];
    const built = overlayOfficialDraw(seats, fixtures, {
      prefix: "atp",
    });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error(built.reason);
    assert.equal(built.drawSize, 8);
    assert.equal(built.seats[2].provider_player_id, "11");
    assert.equal(built.seats[2].player_ref, "cin-2-norrie");
    assert.equal(built.seats[3].provider_player_id, "22");
    assert.equal(built.seats[4].provider_player_id, "31");
    assert.equal(built.seats[5].provider_player_id, "32");
    assert.equal(built.seats[0].provider_player_id, "41");
    assert.equal(built.seats[6].provider_player_id, "42");
    assert.equal(built.matches["9001"], "r0-m1");
    assert.equal(built.matches["9002"], "r0-m2");
    assert.equal(built.matches["9003"], undefined);
    assert.equal(
      new Set(Object.values(built.matches)).size,
      Object.values(built.matches).length
    );
    assert.equal(built.seats[1].seat_kind, "bye");
    assert.equal(built.seats[7].seat_kind, "tbd");
  });

  it("does not give two Cerundolos the same provider id", () => {
    const seats = [
      seat(0, {
        last_name: "Cerundolo",
        given_name: "Francisco",
        player_ref: "p-fc",
        country_code: "ARG",
      }),
      seat(1, { seat_kind: "bye", player_ref: "bye-1" }),
      seat(2, {
        last_name: "Cerundolo",
        given_name: "Juan",
        player_ref: "p-jmc",
        country_code: "ARG",
      }),
      seat(3, {
        last_name: "Nakashima",
        given_name: "Brandon",
        player_ref: "p-nak",
        country_code: "USA",
      }),
    ];
    const fixtures = [
      {
        id: 1,
        player1Id: 52934,
        player2Id: 99,
        player1: { id: 52934, name: "Francisco Cerundolo", countryAcr: "ARG" },
        player2: { id: 99, name: "Brandon Nakashima", countryAcr: "USA" },
      },
    ];
    const built = overlayOfficialDraw(seats, fixtures, {
      prefix: "atp",
    });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error(built.reason);
    assert.equal(built.seats[0].provider_player_id, "52934");
    assert.equal(built.seats[2].provider_player_id, null);
  });

  it("fills a TBD seat from the named opponent's published match", () => {
    const seats = [
      {
        position: 0,
        player_ref: "p-norrie",
        last_name: "Norrie",
        given_name: "Cameron",
        seed: null,
        country_code: "GBR",
        is_bye: false,
        seat_kind: "player",
        entry_status: null,
        provider_player_id: null,
      },
      {
        position: 1,
        player_ref: "tbd-1",
        last_name: "Qualifier",
        seed: null,
        country_code: "XXX",
        is_bye: false,
        seat_kind: "tbd",
        entry_status: null,
        provider_player_id: null,
      },
    ];
    const fixtures = [
      {
        id: 1,
        player1Id: 11,
        player2Id: 22,
        player1: { id: 11, name: "Cameron Norrie", countryAcr: "GBR" },
        player2: { id: 22, name: "Dino Prizmic", countryAcr: "CRO" },
      },
    ];
    const built = overlayOfficialDraw(seats, fixtures, { prefix: "atp" });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error(built.reason);
    assert.equal(built.seats[1].seat_kind, "player");
    assert.equal(built.seats[1].last_name, "Prizmic");
    assert.equal(built.seats[1].provider_player_id, "22");
    assert.equal(built.seats[1].player_ref, "atp-22");
    assert.equal(built.matches["1"], "r0-m0");
  });

  it("maps a later round from official feeders + a published pair", () => {
    const seats = [
      {
        position: 0,
        player_ref: "p-a",
        last_name: "Norrie",
        given_name: "Cameron",
        seed: null,
        country_code: "GBR",
        is_bye: false,
        seat_kind: "player",
        entry_status: null,
        provider_player_id: "11",
      },
      {
        position: 1,
        player_ref: "p-b",
        last_name: "Prizmic",
        given_name: "Dino",
        seed: null,
        country_code: "CRO",
        is_bye: false,
        seat_kind: "player",
        entry_status: null,
        provider_player_id: "22",
      },
      {
        position: 2,
        player_ref: "p-c",
        last_name: "Etcheverry",
        given_name: "Tomas",
        seed: 26,
        country_code: "ARG",
        is_bye: false,
        seat_kind: "player",
        entry_status: null,
        provider_player_id: "33",
      },
      {
        position: 3,
        player_ref: "bye-3",
        last_name: "Bye",
        seed: null,
        country_code: "XXX",
        is_bye: true,
        seat_kind: "bye",
        entry_status: null,
        provider_player_id: null,
      },
    ];
    const fixtures = [
      {
        id: 10,
        player1Id: 11,
        player2Id: 22,
        player1: { id: 11, name: "Cameron Norrie" },
        player2: { id: 22, name: "Dino Prizmic" },
        match_winner: 11,
        result: "6-3 6-2",
      },
      {
        id: 11,
        player1Id: 11,
        player2Id: 33,
        player1: { id: 11, name: "Cameron Norrie" },
        player2: { id: 33, name: "Tomas Martin Etcheverry" },
      },
    ];
    const built = overlayOfficialDraw(seats, fixtures, { prefix: "atp" });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error(built.reason);
    assert.equal(built.matches["10"], "r0-m0");
    assert.equal(built.matches["11"], "r1-m0");
    assert.equal(built.results[0].match_key, "r0-m0");
    assert.equal(built.results[0].winner_ref, "p-a");
  });
});

describe("parseOfficialDraw", () => {
  it("reads ordered first-round matches including bye and TBD", () => {
    const raw = {
      rounds: [
        {
          name: "R32",
          matches: [
            {
              player1: { id: 1, name: "Alexander Zverev", countryAcr: "GER", seed: 1 },
              player2: { name: "Bye" },
            },
            {
              player1: { id: 2, name: "Cameron Norrie", countryAcr: "GBR" },
              player2: { name: "Qualifier" },
            },
          ],
        },
      ],
    };
    // 2 matches is not a power-of-2 first round (>=8). Use 8 matches.
    raw.rounds[0].matches = [
      ...raw.rounds[0].matches,
      ...Array.from({ length: 6 }, (_, i) => ({
        player1: { id: 10 + i, name: `Player Alpha${i}`, countryAcr: "USA" },
        player2: { id: 20 + i, name: `Player Beta${i}`, countryAcr: "ESP" },
      })),
    ];
    const parsed = parseOfficialDraw(raw, { prefix: "atp" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error(parsed.reason);
    assert.equal(parsed.drawSize, 16);
    assert.equal(parsed.seats[0].last_name, "Zverev");
    assert.equal(parsed.seats[1].seat_kind, "bye");
    assert.equal(parsed.seats[3].seat_kind, "tbd");
  });

  it("prefers the expected singles size over a longer doubles array", () => {
    const singles = Array.from({ length: 32 }, (_, i) => ({
      player1: { id: 100 + i, name: `Alpha ${i}`, countryAcr: "USA" },
      player2: { id: 200 + i, name: `Beta ${i}`, countryAcr: "ESP" },
    }));
    const doubles = Array.from({ length: 16 }, (_, i) => ({
      player1: { id: 300 + i, name: `Townsend ${i}`, countryAcr: "USA" },
      player2: { id: 400 + i, name: `Schuurs ${i}`, countryAcr: "NED" },
    }));
    const raw = { rounds: [{ name: "R64", matches: singles }, { name: "D32", matches: doubles }] };
    const parsed = parseOfficialDraw(raw, { prefix: "wta", expectedDrawSize: 64 });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error(parsed.reason);
    assert.equal(parsed.drawSize, 64);
  });

  it("rejects a doubles 32-draw when the event is a 64 singles field", () => {
    const doubles = Array.from({ length: 16 }, (_, i) => ({
      player1: { id: 300 + i, name: `Townsend ${i}`, countryAcr: "USA" },
      player2: { id: 400 + i, name: `Schuurs ${i}`, countryAcr: "NED" },
    }));
    const parsed = parseOfficialDraw(
      { rounds: [{ name: "D32", matches: doubles }] },
      { prefix: "wta", expectedDrawSize: 64 }
    );
    assert.equal(parsed.ok, false);
  });

  it("reads a Round of 64 listed as games", () => {
    const games = Array.from({ length: 32 }, (_, i) => ({
      competitors: [
        { id: 100 + i, lastName: `Alpha${i}`, countryAcr: "USA" },
        { id: 200 + i, lastName: `Beta${i}`, countryAcr: "ESP" },
      ],
    }));
    const parsed = parseOfficialDraw(
      { singlesDraw: { rounds: [{ name: "Round of 64", games }] } },
      { prefix: "wta", expectedDrawSize: 64 }
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error(parsed.reason);
    assert.equal(parsed.drawSize, 64);
    assert.equal(parsed.seats.length, 64);
    assert.equal(parsed.seats[0].last_name, "Alpha0");
  });
});

describe("drawNameCandidates", () => {
  it("uses api_name and strips trailing Open", () => {
    const names = drawNameCandidates({
      ref: "cin-wta-2026",
      api_name: "Cincinnati Open",
    });
    assert.ok(names.includes("Cincinnati Open"));
    assert.ok(names.includes("Cincinnati"));
    assert.equal(names.includes("Western & Southern Open"), false);
  });
});

describe("mapLiveFinishedToIngest", () => {
  it("maps a finished live event with a winner id", () => {
    const { results, skipped } = mapLiveFinishedToIngest(
      [
        {
          id: "live-1",
          status: "Finished",
          matchId: "11-22-21347-12",
          winnerId: 11,
        },
      ],
      {
        tournament_id: "t",
        provider_tournament_id: "21347",
        players: { "11": "p-a" },
        matches: { "11|22": "r0-m0" },
      }
    );
    assert.equal(skipped.length, 0);
    assert.deepEqual(results, [
      { match_key: "r0-m0", winner_ref: "p-a", voided: false },
    ]);
  });

  it("skips finished live events without a winner id", () => {
    const { results, skipped } = mapLiveFinishedToIngest(
      [{ id: "live-2", status: "Finished", matchId: "11-22-21347-12" }],
      {
        tournament_id: "t",
        provider_tournament_id: "21347",
        players: { "11": "p-a" },
        matches: { "11|22": "r0-m0" },
      }
    );
    assert.equal(results.length, 0);
    assert.match(skipped[0].reason, /without winner id/);
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
