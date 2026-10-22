import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DrawSeat } from "@matchread/core";
import {
  buildRoundStructure,
  totalMatches,
} from "../../../../packages/core/src/bracket.ts";
import {
  loadPublicMatch,
  loadTournamentReadModel,
  projectMemberPicks,
  projectTournamentSheet,
  type SheetMatchRow,
} from "./read-model.ts";

const seats: DrawSeat[] = [
  {
    position: 0,
    kind: "player",
    player_id: "p-alden",
    last_name: "Alden",
    seed: 1,
    country_code: "XXX",
  },
  {
    position: 1,
    kind: "player",
    player_id: "p-berg",
    last_name: "Berg",
    seed: null,
    country_code: "XXX",
  },
];

function row(partial: Partial<SheetMatchRow>): SheetMatchRow {
  return {
    tournament_id: "t-1",
    tournament_ref: "syn-16",
    tournament_name: "Synthetic Bracket",
    venue_tz: "UTC",
    draw_size: 16,
    round: 0,
    index_in_round: 0,
    external_ref: "syn16-r0-m0",
    scheduled_at: null,
    has_time: false,
    session: null,
    court: null,
    winner_player_id: null,
    voided: false,
    settled_at: null,
    official_score: null,
    fact_kind: null,
    side_a_player_id: "p-alden",
    side_a_last_name: "Alden",
    side_b_player_id: "p-berg",
    side_b_last_name: "Berg",
    winner_last_name: null,
    ...partial,
  };
}

test("one sheet read projects official rows, TBA, and stored sides", () => {
  const projected = projectTournamentSheet(seats, [
    row({
      winner_player_id: "p-alden",
      official_score: "6-4 6-3",
      fact_kind: "played",
      session: "day",
      court: "Court 1",
      scheduled_at: "2026-08-10T14:00:00.000Z",
      has_time: true,
    }),
    row({
      round: 1,
      index_in_round: 0,
      external_ref: "syn16-r1-m0",
      side_a_player_id: "p-alden",
      side_b_player_id: null,
      side_b_last_name: null,
      winner_player_id: null,
      official_score: "6-4 6-3",
    }),
  ]);

  assert.equal(projected.official["r0-m0"]?.winnerRef, "p-alden");
  assert.equal(projected.official["r1-m0"], undefined);
  assert.equal(projected.schedule["r0-m0"]?.state, "official");
  assert.equal(projected.schedule["r0-m0"]?.session, "day");
  assert.equal(projected.schedule["r0-m0"]?.court, "Court 1");
  assert.equal(projected.schedule["r1-m0"]?.state, "scheduled");
  assert.equal(projected.schedule["r1-m0"]?.scheduled_at, null);
  assert.equal(projected.schedule["r1-m0"]?.side_a?.lastName, "Alden");
  assert.equal(projected.schedule["r1-m0"]?.side_b, null);
  assert.deepEqual(
    projected.announced.map((row) => row.external_ref),
    ["syn16-r0-m0", "syn16-r1-m0"]
  );
});

test("the tournament sheet is one match read", async () => {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      if (table === "seats") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
        };
      }
      assert.equal(table, "tournament_match_sheet");
      return {
        select(columns: string) {
          assert.match(columns, /external_ref/);
          assert.match(columns, /session/);
          assert.doesNotMatch(columns, /\bid\b/);
          return {
            eq(column: string, value: string) {
              assert.equal(column, "tournament_id");
              assert.equal(value, "t-1");
              return Promise.resolve({
                data: [row({})],
                error: null,
              });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const model = await loadTournamentReadModel(client, "t-1");
  assert.deepEqual(calls, ["seats", "tournament_match_sheet"]);
  assert.equal(calls.includes("matches"), false);
  assert.equal(model.schedule["r0-m0"]?.external_ref, "syn16-r0-m0");
  assert.equal(model.matches.length, 1);
  assert.equal(model.ref, "syn-16");
  assert.equal(model.drawSize, 16);
  assert.deepEqual(model.picks, {});
  assert.equal(model.entry, null);
});

test("member picks ride the same tournament read", async () => {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      if (table === "seats") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "brackets") {
        return {
          select(columns: string) {
            assert.match(columns, /picks\(player_id, confidence, matches\(round, index_in_round\)\)/);
            assert.doesNotMatch(columns, /players\(/);
            return {
              eq() {
                return this;
              },
              maybeSingle() {
                return Promise.resolve({
                  data: {
                    id: "b-1",
                    submitted_at: null,
                    updated_at: null,
                    points: null,
                    rank: null,
                    champion_player_id: null,
                    picks: [
                      {
                        player_id: "p-alden",
                        confidence: 4,
                        matches: { round: 0, index_in_round: 0 },
                      },
                    ],
                  },
                  error: null,
                });
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [row({})], error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const model = await loadTournamentReadModel(client, "t-1", {
    leagueId: "lg-1",
    userId: "u-1",
  });
  assert.deepEqual(calls.sort(), ["brackets", "seats", "tournament_match_sheet"]);
  assert.equal(model.picks["r0-m0"], "p-alden");
  assert.equal(model.confidence["r0-m0"], 4);
  assert.equal(model.entry?.id, "b-1");
});

test("a 128-draw sheet is one ordered read of 127 matches", async () => {
  const drawSize = 128;
  const rounds = buildRoundStructure(drawSize);
  assert.equal(totalMatches(drawSize), 127);
  assert.equal(rounds.length, 7);

  const drawSeats: DrawSeat[] = Array.from({ length: drawSize }, (_, position) => ({
    position,
    kind: "player" as const,
    player_id: `p-${position}`,
    last_name: `S${position}`,
    seed: position === 0 ? 1 : null,
    country_code: "XXX",
  }));

  const sheetRows: SheetMatchRow[] = [];
  for (const round of rounds) {
    for (const match of round.matches) {
      const firstRound = match.round === 0;
      const seatA = firstRound ? drawSeats[match.indexInRound * 2] : undefined;
      const seatB = firstRound ? drawSeats[match.indexInRound * 2 + 1] : undefined;
      const settled = match.key === "r0-m0";
      const timed = match.key === "r0-m1";
      sheetRows.push(
        row({
          tournament_ref: "draw-128",
          tournament_name: "Synthetic 128",
          draw_size: drawSize,
          round: match.round,
          index_in_round: match.indexInRound,
          external_ref: `fx-128-${match.key}`,
          scheduled_at: timed ? "2026-08-10T14:00:00.000Z" : null,
          has_time: timed,
          side_a_player_id: seatA?.player_id ?? null,
          side_a_last_name: seatA?.last_name ?? null,
          side_b_player_id: seatB?.player_id ?? null,
          side_b_last_name: seatB?.last_name ?? null,
          winner_player_id: settled ? "p-0" : null,
          winner_last_name: settled ? "S0" : null,
          official_score: settled ? "6-4 6-2" : null,
          fact_kind: settled ? "played" : null,
          settled_at: settled ? "2026-08-10T16:00:00.000Z" : null,
        })
      );
    }
  }
  assert.equal(sheetRows.length, 127);

  const calls: string[] = [];
  let sheetSelects = 0;
  const client = {
    from(table: string) {
      calls.push(table);
      if (table === "seats") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return Promise.resolve({ data: drawSeats, error: null });
                  },
                };
              },
            };
          },
        };
      }
      assert.equal(table, "tournament_match_sheet");
      return {
        select() {
          sheetSelects += 1;
          return {
            eq() {
              return Promise.resolve({
                data: [...sheetRows].reverse(),
                error: null,
              });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const model = await loadTournamentReadModel(client, "t-128");

  assert.deepEqual(calls, ["seats", "tournament_match_sheet"]);
  assert.equal(sheetSelects, 1);
  assert.equal(calls.filter((table) => table === "players").length, 0);
  assert.equal(calls.filter((table) => table === "matches").length, 0);

  assert.equal(model.matches.length, 127);
  assert.equal(model.drawSize, 128);
  assert.equal(model.ref, "draw-128");
  const keys = model.matches.map(
    (match) => `r${match.round}-m${match.index_in_round}`
  );
  assert.equal(new Set(keys).size, 127);
  assert.deepEqual(
    keys,
    rounds.flatMap((round) => round.matches.map((match) => match.key))
  );

  for (const match of rounds[0].matches) {
    const scheduled = model.schedule[match.key];
    const seatA = drawSeats[match.indexInRound * 2];
    const seatB = drawSeats[match.indexInRound * 2 + 1];
    assert.equal(scheduled?.side_a?.ref, seatA.player_id);
    assert.equal(scheduled?.side_a?.lastName, seatA.last_name);
    assert.equal(scheduled?.side_b?.ref, seatB.player_id);
    assert.equal(scheduled?.external_ref, `fx-128-${match.key}`);
  }
  assert.equal(model.schedule["r0-m0"]?.side_a?.seed, 1);

  assert.equal(model.official["r0-m0"]?.winnerRef, "p-0");
  assert.equal(model.official["r0-m0"]?.officialScore, "6-4 6-2");
  assert.equal(model.schedule["r0-m0"]?.state, "official");
  assert.equal(model.matches[0].winner_last_name, "S0");

  assert.equal(model.schedule["r0-m1"]?.scheduled_at, "2026-08-10T14:00:00.000Z");
  assert.equal(model.schedule["r0-m1"]?.has_time, true);
  assert.equal(model.schedule["r0-m1"]?.state, "scheduled");

  assert.equal(model.schedule["r6-m0"]?.scheduled_at, null);
  assert.equal(model.matches.find((match) => match.round === 6)?.scheduled_at, null);
  assert.equal(model.official["r6-m0"], undefined);

  assert.deepEqual(
    model.announced.map((match) => match.match_key),
    rounds[0].matches.map((match) => match.key)
  );
});

test("a bare id or uuid is not a public match lookup", async () => {
  const supabase = {
    from() {
      throw new Error("internal id must not be queried");
    },
  } as unknown as SupabaseClient;
  assert.equal(await loadPublicMatch(supabase, "12345"), null);
  assert.equal(
    await loadPublicMatch(supabase, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    null
  );
  assert.equal(await loadPublicMatch(supabase, ""), null);
});

test("pick rows become match keys without a match query", () => {
  const highlight = projectMemberPicks([
    {
      player_id: "p-dahl",
      confidence: null,
      matches: [{ round: 1, index_in_round: 0 }],
    },
  ]);
  assert.deepEqual(highlight.picks, { "r1-m0": "p-dahl" });
  assert.deepEqual(highlight.confidence, {});
});
