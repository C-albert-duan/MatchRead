import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlatformLocked, isTournamentLocked, mapDrawSeat } from "./types.ts";

const now = new Date("2026-08-12T12:00:00.000Z");

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

test("mapDrawSeat keeps bye, TBD, and entry tags", () => {
  const bye = mapDrawSeat({
    position: 1,
    player_ref: "bye-1",
    last_name: "Bye",
    is_bye: true,
    seat_kind: "bye",
  });
  const tbd = mapDrawSeat({
    position: 10,
    player_ref: "tbd-10",
    last_name: "Qualifier",
    seat_kind: "tbd",
  });
  const wc = mapDrawSeat({
    position: 37,
    player_ref: "cin-37-draper",
    last_name: "Draper",
    country_code: "GBR",
    seat_kind: "player",
    entry_status: "wc",
  });
  assert.equal(bye.seat_kind, "bye");
  assert.equal(bye.is_bye, true);
  assert.equal(tbd.seat_kind, "tbd");
  assert.equal(tbd.is_bye, false);
  assert.equal(wc.entry_status, "wc");
});
