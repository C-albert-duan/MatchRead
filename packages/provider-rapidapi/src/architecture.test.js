import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  advanceWinnerToParent,
  bindResultsByPlayerPair,
  createLiveSessionState,
  diffDrawSeats,
  drawPollIntervalMs,
  hashDrawSeats,
  isSilentSubscription,
  onSocketDisconnect,
  parentMatchKey,
  reconcileThenResume,
  resolveLiveEvent,
  shouldPollDraw,
  subscriptionDiff,
  validateOfficialSeats,
} from "./index.js";

function seat(position, overrides = {}) {
  return {
    position,
    seat_kind: overrides.kind || "player",
    kind: overrides.kind || "player",
    provider_player_id: overrides.provider_player_id ?? String(position + 1),
    last_name: overrides.last_name ?? `P${position}`,
    seed: overrides.seed ?? null,
    entry_status: overrides.entry ?? null,
    is_bye: overrides.kind === "bye",
  };
}

describe("validateOfficialSeats", () => {
  it("accepts a contiguous 8-draw", () => {
    const seats = Array.from({ length: 8 }, (_, i) => seat(i));
    const v = validateOfficialSeats(seats);
    assert.equal(v.ok, true);
  });

  it("rejects duplicate players", () => {
    const seats = Array.from({ length: 8 }, (_, i) =>
      seat(i, { provider_player_id: i < 2 ? "1" : String(i + 10) })
    );
    const v = validateOfficialSeats(seats);
    assert.equal(v.ok, false);
  });

  it("rejects gaps", () => {
    const seats = [seat(0), seat(1), seat(3)];
    const v = validateOfficialSeats(seats);
    assert.equal(v.ok, false);
  });
});

describe("hashDrawSeats", () => {
  it("is stable for same seats", async () => {
    const seats = Array.from({ length: 8 }, (_, i) => seat(i));
    const a = await hashDrawSeats(seats);
    const b = await hashDrawSeats([...seats].reverse());
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });
});

describe("diffDrawSeats", () => {
  it("detects replacement at a slot", () => {
    const prev = [seat(0, { provider_player_id: "10" }), seat(1)];
    const next = [seat(0, { provider_player_id: "99" }), seat(1)];
    const changes = diffDrawSeats(prev, next);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].change_kind, "replacement");
    assert.equal(changes[0].old_provider_player_id, "10");
    assert.equal(changes[0].new_provider_player_id, "99");
  });

  it("detects tbd filled", () => {
    const prev = [seat(0, { kind: "tbd", provider_player_id: null })];
    const next = [seat(0, { provider_player_id: "5" })];
    const changes = diffDrawSeats(prev, next);
    assert.equal(changes[0].change_kind, "tbd_filled");
  });
});

describe("drawPollIntervalMs / shouldPollDraw", () => {
  it("polls faster with TBD seats", () => {
    const ms = drawPollIntervalMs({ tbdCount: 3, hasDraw: true });
    assert.equal(ms, 5 * 60_000);
  });

  it("should poll when never checked", () => {
    assert.equal(shouldPollDraw({ hasDraw: false }), true);
  });
});

describe("parent advance", () => {
  it("maps odd/even children to A/B", () => {
    assert.deepEqual(parentMatchKey(0, 0), {
      round: 1,
      indexInRound: 0,
      side: "a",
      key: "r1-m0",
    });
    assert.deepEqual(parentMatchKey(0, 1), {
      round: 1,
      indexInRound: 0,
      side: "b",
      key: "r1-m0",
    });
    const adv = advanceWinnerToParent(0, 3, "uuid-w");
    assert.equal(adv?.sideColumn, "side_b_player_id");
    assert.equal(adv?.key, "r1-m1");
  });
});

describe("bindResultsByPlayerPair", () => {
  it("binds by player pair when fixture id unknown", () => {
    const { results, bindings } = bindResultsByPlayerPair(
      [
        {
          id: "fx-1",
          player1Id: "10",
          player2Id: "20",
          match_winner: 10,
        },
      ],
      [
        {
          match_key: "r0-m0",
          round: 0,
          index_in_round: 0,
          side_a_provider_id: "10",
          side_b_provider_id: "20",
          provider_match_id: null,
        },
      ],
      { "10": "10", "20": "20" }
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].match_key, "r0-m0");
    assert.equal(results[0].winner_provider_id, "10");
    assert.equal(bindings[0].provider_match_id, "fx-1");
  });
});

describe("EventMapper resolveLiveEvent", () => {
  it("maps from live events by player pair", async () => {
    const resolved = await resolveLiveEvent(
      {
        player1Id: "1",
        player2Id: "2",
        providerTournamentId: "99",
      },
      [
        {
          id: "sock-7",
          matchId: "1-2-99-1",
        },
      ]
    );
    assert.equal(resolved.status, "mapped");
    assert.equal(resolved.socket_event_id, "sock-7");
  });

  it("returns not_found when empty", async () => {
    const resolved = await resolveLiveEvent(
      { player1Id: "1", player2Id: "2" },
      []
    );
    assert.equal(resolved.status, "not_found");
    assert.equal(resolved.socket_event_id, null);
  });
});

describe("slot to parent bijection", () => {
  for (const n of [8, 16, 32, 64, 128]) {
    it(`N=${n}: every R0 match has unique parent side`, () => {
      const sides = new Set();
      const r0 = n / 2;
      for (let i = 0; i < r0; i++) {
        const p = parentMatchKey(0, i);
        const token = `${p.key}:${p.side}`;
        assert.equal(sides.has(token), false);
        sides.add(token);
      }
      assert.equal(sides.size, r0);
    });
  }
});

describe("official draw order ignores fixture shuffle", () => {
  it("validateOfficialSeats order is by position not array order", () => {
    const seats = [
      seat(2, { provider_player_id: "3" }),
      seat(0, { provider_player_id: "1" }),
      seat(1, { provider_player_id: "2" }),
      seat(3, { provider_player_id: "4" }),
      seat(4, { provider_player_id: "5" }),
      seat(5, { provider_player_id: "6" }),
      seat(6, { provider_player_id: "7" }),
      seat(7, { provider_player_id: "8" }),
    ];
    const v = validateOfficialSeats(seats);
    assert.equal(v.ok, true);
  });
});

describe("live session reconcile-then-resume", () => {
  it("blocks joins until REST sweep completes", async () => {
    const session = createLiveSessionState();
    onSocketDisconnect(session);
    session.desiredEventIds.add("e1");
    assert.deepEqual(subscriptionDiff(session).toJoin, []);

    let swept = false;
    await reconcileThenResume(session, async () => {
      swept = true;
    });
    assert.equal(swept, true);
    assert.equal(session.allowJoin, true);
    assert.deepEqual(subscriptionDiff(session).toJoin, ["e1"]);
  });

  it("detects silent subscription", () => {
    const session = createLiveSessionState();
    session.joinedEventIds.add("e1");
    session.lastRestSyncAt = new Date(Date.now() - 120_000).toISOString();
    assert.equal(isSilentSubscription(session, 60_000), true);
  });
});

describe("reconcile withhold-then-heal", () => {
  it("advances R32 winner into R16 without double-writing on replay", () => {
    // Simulate Fonseca (p1) vs O'Connell (p2) at r0-m3 → parent r1-m1 side b
    const first = advanceWinnerToParent(0, 3, "fonseca");
    assert.equal(first.key, "r1-m1");
    assert.equal(first.sideColumn, "side_b_player_id");
    assert.equal(first.winnerPlayerId, "fonseca");

    const replay = advanceWinnerToParent(0, 3, "fonseca");
    assert.deepEqual(replay, first);
  });

  it("binds a withheld result when later supplied", () => {
    const matchSides = [
      {
        match_key: "r0-m3",
        round: 0,
        index_in_round: 3,
        side_a_provider_id: "fonseca",
        side_b_provider_id: "oconnell",
        provider_match_id: null,
      },
    ];
    const empty = bindResultsByPlayerPair([], matchSides, {
      fonseca: "fonseca",
      oconnell: "oconnell",
    });
    assert.equal(empty.results.length, 0);

    const healed = bindResultsByPlayerPair(
      [
        {
          id: "999",
          player1Id: "fonseca",
          player2Id: "oconnell",
          match_winner: "fonseca",
          result_type: "completed",
        },
      ],
      matchSides,
      { fonseca: "fonseca", oconnell: "oconnell" }
    );
    assert.equal(healed.results.length, 1);
    assert.equal(healed.results[0].match_key, "r0-m3");
    assert.equal(healed.results[0].winner_provider_id, "fonseca");

    const twice = bindResultsByPlayerPair(
      [
        {
          id: "999",
          player1Id: "fonseca",
          player2Id: "oconnell",
          match_winner: "fonseca",
        },
        {
          id: "999",
          player1Id: "fonseca",
          player2Id: "oconnell",
          match_winner: "fonseca",
        },
      ],
      matchSides,
      { fonseca: "fonseca", oconnell: "oconnell" }
    );
    // Two archive rows still map to one match_key; callers upsert by key.
    assert.equal(twice.results.length, 2);
    assert.equal(twice.results[0].match_key, twice.results[1].match_key);
  });

  it("walkover without score still binds a winner", () => {
    const matchSides = [
      {
        match_key: "r0-m0",
        round: 0,
        index_in_round: 0,
        side_a_provider_id: "a",
        side_b_provider_id: "b",
      },
    ];
    const out = bindResultsByPlayerPair(
      [
        {
          id: "1",
          player1Id: "a",
          player2Id: "b",
          match_winner: "b",
          result_type: "walkover",
        },
      ],
      matchSides,
      { a: "a", b: "b" }
    );
    assert.equal(out.results[0].winner_provider_id, "b");
    assert.equal(out.results[0].voided, false);
  });
});
