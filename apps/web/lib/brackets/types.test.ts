import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  effectiveDrawSize,
  isPlatformLocked,
  isTimedMatchStarted,
  isTournamentLocked,
  loadOfficialResultsMap,
  mapDrawSeat,
  parseMatchKey,
} from "./types.ts";

const now = new Date("2026-08-12T12:00:00.000Z");

test("effectiveDrawSize prefers a power-of-two seat count over a missing hint", () => {
  assert.equal(effectiveDrawSize(32, 0), 32);
  assert.equal(effectiveDrawSize(32, null), 32);
  assert.equal(effectiveDrawSize(0, 64), 64);
  assert.equal(effectiveDrawSize(30, 32), 32);
});

test("platform first-ball lock is independent of a league lock", () => {
  assert.equal(
    isPlatformLocked({
      lock_at: "2026-08-13T17:00:00.000Z",
      admin_locked_at: null,
      now,
    }),
    false
  );
  assert.equal(
    isTournamentLocked({
      lock_at: "2026-08-13T17:00:00.000Z",
      admin_locked_at: null,
      league_locked_at: "2026-08-11T12:00:00.000Z",
      now,
    }),
    true
  );
});

test("a league lock does not make isPlatformLocked true", () => {
  assert.equal(
    isPlatformLocked({
      lock_at: "2026-08-13T17:00:00.000Z",
      admin_locked_at: null,
      now,
    }),
    false
  );
});

test("lock_at without an official sheet does not lock picks", () => {
  const pastLock = "2026-08-11T17:00:00.000Z";
  assert.equal(
    isTournamentLocked({
      lock_at: pastLock,
      admin_locked_at: null,
      hasOfficialDraw: false,
      now,
    }),
    false
  );
  assert.equal(
    isTournamentLocked({
      lock_at: pastLock,
      admin_locked_at: null,
      hasOfficialDraw: true,
      now,
    }),
    true
  );
  assert.equal(
    isPlatformLocked({
      lock_at: pastLock,
      admin_locked_at: null,
      hasOfficialDraw: false,
      now,
    }),
    false
  );
});

test("a founder lock still holds without an official sheet", () => {
  assert.equal(
    isTournamentLocked({
      lock_at: null,
      admin_locked_at: "2026-08-13T12:00:00.000Z",
      hasOfficialDraw: false,
      now,
    }),
    true
  );
});

test("timed matches start only when the provider published a clock", () => {
  assert.equal(
    isTimedMatchStarted(
      { scheduled_at: "2026-08-12T11:00:00.000Z", has_time: true },
      now
    ),
    true
  );
  assert.equal(
    isTimedMatchStarted(
      { scheduled_at: "2026-08-12T11:00:00.000Z", has_time: false },
      now
    ),
    false
  );
  assert.equal(
    isTimedMatchStarted(
      { scheduled_at: "2026-08-13T17:00:00.000Z", has_time: true },
      now
    ),
    false
  );
});

test("mapDrawSeat keeps bye, TBD, and entry tags", () => {
  const bye = mapDrawSeat({
    position: 1,
    kind: "bye",
    player_id: null,
  });
  const tbd = mapDrawSeat({
    position: 10,
    kind: "tbd",
    player_id: null,
    tbd_label: "Qualifier",
  });
  const wc = mapDrawSeat({
    position: 37,
    kind: "player",
    player_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    last_name: "Draper",
    country_code: "GBR",
    entry: "wc",
  });
  assert.equal(bye.kind, "bye");
  assert.equal(bye.player_id, null);
  assert.equal(tbd.kind, "tbd");
  assert.equal(tbd.tbd_label, "Qualifier");
  assert.equal(tbd.last_name, "Qualifier");
  assert.equal(wc.entry, "wc");
  assert.equal(wc.player_id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

test("parseMatchKey reads rN-mM", () => {
  assert.deepEqual(parseMatchKey("r0-m3"), { round: 0, index_in_round: 3 });
  assert.equal(parseMatchKey("bad"), null);
});

function matchesClient(payload: {
  data: unknown;
  error: { message: string } | null;
}) {
  return {
    from(table: string) {
      assert.equal(table, "matches");
      return {
        select(columns: string) {
          assert.match(columns, /official_score/);
          assert.match(columns, /fact_kind/);
          return {
            eq(column: string, value: string) {
              assert.equal(column, "tournament_id");
              assert.equal(value, "t-1");
              return Promise.resolve(payload);
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

test("a missing official_score column is not a score-less winner map", async () => {
  await assert.rejects(
    () =>
      loadOfficialResultsMap(
        matchesClient({
          data: [
            {
              round: 0,
              index_in_round: 0,
              winner_player_id: "p1",
              voided: false,
              official_score: null,
              fact_kind: null,
            },
          ],
          error: { message: "column matches.official_score does not exist" },
        }),
        "t-1"
      ),
    /official results: column matches.official_score does not exist/
  );
});

test("official results keep a stored score and a null score", async () => {
  const map = await loadOfficialResultsMap(
    matchesClient({
      data: [
        {
          round: 0,
          index_in_round: 0,
          winner_player_id: "p1",
          voided: false,
          official_score: "6-4 6-2",
          fact_kind: "played",
        },
        {
          round: 0,
          index_in_round: 1,
          winner_player_id: "p2",
          voided: false,
          official_score: null,
          fact_kind: "played",
        },
        {
          round: 0,
          index_in_round: 2,
          winner_player_id: "p3",
          voided: false,
          official_score: "   ",
          fact_kind: "not-a-kind",
        },
        {
          round: 0,
          index_in_round: 3,
          winner_player_id: null,
          voided: true,
          official_score: null,
          fact_kind: "void",
        },
        {
          round: 0,
          index_in_round: 4,
          winner_player_id: null,
          voided: false,
          official_score: "6-0 6-0",
          fact_kind: "played",
        },
      ],
      error: null,
    }),
    "t-1"
  );
  assert.deepEqual(map["r0-m0"], {
    winnerRef: "p1",
    voided: false,
    officialScore: "6-4 6-2",
    factKind: "played",
  });
  assert.deepEqual(map["r0-m1"], {
    winnerRef: "p2",
    voided: false,
    officialScore: null,
    factKind: "played",
  });
  assert.deepEqual(map["r0-m2"], {
    winnerRef: "p3",
    voided: false,
    officialScore: null,
    factKind: null,
  });
  assert.deepEqual(map["r0-m3"], {
    winnerRef: null,
    voided: true,
    officialScore: null,
    factKind: "void",
  });
  assert.equal(map["r0-m4"], undefined);
});

test("any official-results select error fails the read", async () => {
  await assert.rejects(
    () =>
      loadOfficialResultsMap(
        matchesClient({
          data: null,
          error: { message: "permission denied for table matches" },
        }),
        "t-1"
      ),
    /official results: permission denied for table matches/
  );
});
