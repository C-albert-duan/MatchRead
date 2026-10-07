import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  advanceWinnerToParent,
  bindResultsByPlayerPair,
  createLiveSessionState,
  diffDrawSeats,
  overlaySeatPatch,
  planFakeByeUnwind,
  r0IndexFromSeatPosition,
  drawPollIntervalMs,
  hashDrawSeats,
  isSilentSubscription,
  onSocketDisconnect,
  parentMatchKey,
  drawProviderMatchWrites,
  planProviderMatchRelocation,
  overlayOfficialDraw,
  planArchiveResults,
  reconcileThenResume,
  shouldReconcileDraw,
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

  it("emits bye_to_tbd when a published bye becomes official TBD", () => {
    const prev = [seat(0, { kind: "bye", provider_player_id: null })];
    const next = [
      seat(0, { kind: "tbd", provider_player_id: null, last_name: "Qualifier" }),
    ];
    const changes = diffDrawSeats(prev, next);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].change_kind, "bye_to_tbd");
    assert.equal(changes[0].old_kind, "bye");
    assert.equal(changes[0].new_kind, "tbd");
  });

  it("emits tbd_to_bye only when the official sheet is a bye", () => {
    const prev = [seat(1, { kind: "tbd", provider_player_id: null })];
    const next = [seat(1, { kind: "bye", provider_player_id: null })];
    const changes = diffDrawSeats(prev, next);
    assert.equal(changes[0].change_kind, "tbd_to_bye");
  });
});

describe("overlaySeatPatch / planFakeByeUnwind", () => {
  it("rewrites published bye to tbd and clears player_id", () => {
    const patch = overlaySeatPatch(
      { kind: "bye", player_id: null },
      { kind: "tbd", tbd_label: "Qualifier", entry: "q" }
    );
    assert.equal(patch.kind, "tbd");
    assert.equal(patch.tbd_label, "Qualifier");
    assert.equal(patch.player_id, null);
    assert.equal(patch.entry, "q");
  });

  it("does not rewrite an official bye that stays a bye", () => {
    assert.equal(
      overlaySeatPatch({ kind: "bye" }, { kind: "bye" }),
      null
    );
  });

  it("unwinds fake R0 bye settle and an unplayed parent side", () => {
    const slot = r0IndexFromSeatPosition(1);
    assert.equal(slot.indexInRound, 0);
    assert.equal(slot.childSide, "b");
    const plan = planFakeByeUnwind({
      childWinnerId: "p-named",
      remainingPlayerId: "p-named",
      vacatedPlayerId: null,
      parentWinnerId: null,
      parentSettledAt: null,
      parentOccupantId: "p-named",
    });
    assert.equal(plan.clearChildSettlement, true);
    assert.equal(plan.clearParentSide, true);
  });

  it("does not unwind a parent that already has a played result", () => {
    const plan = planFakeByeUnwind({
      childWinnerId: "p-named",
      remainingPlayerId: "p-named",
      vacatedPlayerId: null,
      parentWinnerId: "p-named",
      parentSettledAt: "2026-09-20T00:00:00Z",
      parentOccupantId: "p-named",
    });
    assert.equal(plan.clearChildSettlement, true);
    assert.equal(plan.clearParentSide, false);
  });

  it("does not unwind a named-vs-named R0 result", () => {
    const plan = planFakeByeUnwind({
      childWinnerId: "p-a",
      remainingPlayerId: "p-a",
      vacatedPlayerId: "p-b",
      parentWinnerId: null,
      parentSettledAt: null,
      parentOccupantId: "p-a",
    });
    assert.equal(plan.clearChildSettlement, false);
    assert.equal(plan.clearParentSide, false);
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

  it("force-polls unpublished near main draw even if recently checked", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    assert.equal(
      shouldPollDraw({
        hasDraw: false,
        main_draw_starts_on: "2026-08-25",
        draw_checked_at: "2026-08-24T11:55:00Z",
        now,
      }),
      true
    );
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

  it("prefers pair over stale synthetic provider_match_id and rewrites binding", () => {
    const { results, bindings } = bindResultsByPlayerPair(
      [
        {
          id: "871044",
          player1Id: "a",
          player2Id: "b",
          match_winner: "a",
          result_type: "completed",
        },
      ],
      [
        {
          match_key: "r0-m0",
          round: 0,
          index_in_round: 0,
          side_a_provider_id: "a",
          side_b_provider_id: "b",
          provider_match_id: "802",
        },
      ],
      { a: "a", b: "b" }
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].match_key, "r0-m0");
    assert.equal(results[0].provider_match_id, "871044");
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].provider_match_id, "871044");
    assert.equal(bindings[0].bound_by, "pair");
  });

  function side(match_key, round, index_in_round, a, b, provider_match_id = null) {
    return {
      match_key,
      round,
      index_in_round,
      side_a_provider_id: a,
      side_b_provider_id: b,
      provider_match_id,
    };
  }

  it("binds a unique later-round pair when R0 byes share the same player id", () => {
    for (const { slots, laterRound, laterIndex } of [
      { slots: 32, laterRound: 2, laterIndex: 1 },
      { slots: 64, laterRound: 3, laterIndex: 1 },
      { slots: 128, laterRound: 4, laterIndex: 2 },
    ]) {
      const laterKey = `r${laterRound}-m${laterIndex}`;
      const { results, bindings, skipped } = bindResultsByPlayerPair(
        [
          {
            id: "8710444",
            player1Id: "pA",
            player2Id: "pB",
            match_winner: "pA",
            result_type: "completed",
          },
        ],
        [
          side("r0-m8", 0, 8, "pA", null),
          side("r0-m9", 0, 9, "pC", null),
          side(laterKey, laterRound, laterIndex, null, "pA"),
          side(`r${laterRound}-m0`, laterRound, 0, "pX", "pY"),
        ],
        { pA: "pA", pB: "pB" }
      );
      assert.equal(skipped.length, 0, `slots=${slots}`);
      assert.equal(results.length, 1, `slots=${slots}`);
      assert.equal(results[0].match_key, laterKey, `slots=${slots}`);
      assert.equal(results[0].winner_provider_id, "pA");
      assert.equal(results[0].voided, false);
      assert.equal(bindings.length, 1);
      assert.equal(bindings[0].match_key, laterKey);
      assert.equal(bindings[0].bound_by, "partial");
      const parent = advanceWinnerToParent(laterRound, laterIndex, "pA");
      assert.equal(
        parent.key,
        `r${laterRound + 1}-m${Math.floor(laterIndex / 2)}`
      );
      assert.equal(
        parent.sideColumn,
        laterIndex % 2 === 0 ? "side_a_player_id" : "side_b_player_id"
      );
      assert.equal(parent.winnerPlayerId, "pA");
    }
  });

  it("fails closed when two later-round one-sided matches fit the pair", () => {
    const { results, bindings, skipped } = bindResultsByPlayerPair(
      [
        {
          id: "8710555",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      [
        side("r0-m16", 0, 16, "pA", null),
        side("r5-m1", 5, 1, "pB", null),
        side("r6-m0", 6, 0, "pA", null),
        side("r4-m0", 4, 0, "pX", "pY", "8710555"),
      ],
      { pA: "pA", pB: "pB" }
    );
    assert.equal(results.length, 0);
    assert.equal(bindings.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, "ambiguous later-round partial");
  });

  it("does not let a stale provider_match_id steal a unique later-round bind", () => {
    const { results, bindings, skipped } = bindResultsByPlayerPair(
      [
        {
          id: "8710666",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      [
        side("r0-m32", 0, 32, "pA", null),
        side("r4-m0", 4, 0, "pX", "pY", "8710666"),
        side("r1-m31", 1, 31, "pZ", null, "8710666"),
        side("r4-m2", 4, 2, null, "pA"),
      ],
      { pA: "pA", pB: "pB" }
    );
    assert.equal(skipped.length, 0);
    assert.equal(results.length, 1);
    assert.equal(results[0].match_key, "r4-m2");
    assert.equal(results[0].winner_provider_id, "pA");
    assert.equal(bindings[0].match_key, "r4-m2");
    assert.equal(bindings[0].provider_match_id, "8710666");
    assert.equal(bindings[0].bound_by, "partial");
  });

  it("does not select an R0 one-sided match with the later-round partial rule", () => {
    const { results, bindings, skipped } = bindResultsByPlayerPair(
      [
        {
          id: "8710777",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pB",
          result_type: "completed",
        },
      ],
      [
        side("r0-m0", 0, 0, "pA", null, "8710777"),
        side("r1-m0", 1, 0, "pC", "pD"),
      ],
      { pA: "pA", pB: "pB" }
    );
    assert.equal(results.length, 0);
    assert.equal(bindings.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, "no match_key mapping");
  });

  it("binds the unique later-round hole and does not keep the archive id on R0", () => {
    const { results, bindings, skipped } = bindResultsByPlayerPair(
      [
        {
          id: "8800222",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      [
        side("r0-m4", 0, 4, "pA", null, "8800222"),
        side("r2-m2", 2, 2, null, "pA"),
      ],
      { pA: "pA", pB: "pB" }
    );
    assert.equal(skipped.length, 0);
    assert.equal(results.length, 1);
    assert.equal(results[0].match_key, "r2-m2");
    assert.equal(results[0].winner_provider_id, "pA");
    assert.equal(results[0].provider_match_id, "8800222");
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].match_key, "r2-m2");
    assert.equal(bindings[0].bound_by, "partial");
    const parent = advanceWinnerToParent(2, 2, "pA");
    assert.equal(parent.key, "r3-m1");
    assert.equal(parent.sideColumn, "side_a_player_id");
  });

  it("rejects a later-round candidate whose provider_match_id is a different canonical id", () => {
    const { results, bindings, skipped } = bindResultsByPlayerPair(
      [
        {
          id: "8800333",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      [
        side("r0-m3", 0, 3, "pA", null, "8800333"),
        side("r2-m1", 2, 1, "pA", null, "8800999"),
      ],
      { pA: "pA", pB: "pB" }
    );
    assert.equal(results.length, 0);
    assert.equal(bindings.length, 0);
    assert.equal(skipped[0].reason, "no match_key mapping");
  });

  it("ignores a foreign provider_match_id and keeps the single compatible later-round hole", () => {
    const { results, bindings } = bindResultsByPlayerPair(
      [
        {
          id: "8800444",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pB",
          result_type: "completed",
        },
      ],
      [
        side("r3-m0", 3, 0, "pA", null, "7700001"),
        side("r3-m1", 3, 1, null, "pA"),
        side("r0-m1", 0, 1, "pA", null, "8800444"),
      ],
      { pA: "pA", pB: "pB" }
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].match_key, "r3-m1");
    assert.equal(results[0].winner_provider_id, "pB");
    assert.equal(bindings[0].match_key, "r3-m1");
    assert.equal(bindings[0].bound_by, "partial");
  });

  it("leaves the row unbound when no later-round candidate exists", () => {
    const { results, bindings, skipped } = bindResultsByPlayerPair(
      [
        {
          id: "8800555",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      [side("r1-m0", 1, 0, "pC", "pD"), side("r2-m0", 2, 0, "pE", "pF")],
      { pA: "pA", pB: "pB" }
    );
    assert.equal(results.length, 0);
    assert.equal(bindings.length, 0);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, "no match_key mapping");
    const idle = planProviderMatchRelocation(bindings[0], [
      side("r0-m0", 0, 0, "pA", null, "8800555"),
      side("r1-m0", 1, 0, "pC", "pD"),
      side("r2-m0", 2, 0, "pE", "pF"),
    ]);
    assert.equal(idle.releases.length, 0);
    assert.equal(idle.assign, null);
  });

  it("moves an emitted provider id off the earlier holder onto the later hole", () => {
    const holder = side("r0-m4", 0, 4, "pA", null, "8800222");
    holder.winner_player_id = "uuid-a";
    holder.settled_at = "2026-09-20T06:14:31.583Z";
    holder.side_a_player_id = "uuid-a";
    const later = side("r2-m2", 2, 2, null, "pA");
    const matchSides = [holder, later];
    const { results, bindings, skipped } = bindResultsByPlayerPair(
      [
        {
          id: "8800222",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      matchSides,
      { pA: "pA", pB: "pB" }
    );
    assert.equal(skipped.length, 0);
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].match_key, "r2-m2");
    const plan = planProviderMatchRelocation(bindings[0], matchSides);
    assert.equal(plan.releases.length, 1);
    assert.equal(plan.releases[0].match_key, "r0-m4");
    assert.deepEqual(plan.releases[0].patch, { provider_match_id: null });
    assert.equal(plan.assign.match_key, "r2-m2");
    assert.deepEqual(plan.assign.patch, { provider_match_id: "8800222" });
    const after = applyRelocation(matchSides, plan);
    assert.equal(after.get("r0-m4").provider_match_id, null);
    assert.equal(after.get("r0-m4").winner_player_id, "uuid-a");
    assert.equal(after.get("r0-m4").settled_at, "2026-09-20T06:14:31.583Z");
    assert.equal(after.get("r0-m4").side_a_player_id, "uuid-a");
    assert.equal(after.get("r2-m2").provider_match_id, "8800222");
    assert.equal(results[0].match_key, "r2-m2");
    assert.equal(results[0].winner_provider_id, "pA");
    const parent = advanceWinnerToParent(2, 2, results[0].winner_provider_id);
    assert.equal(parent.key, "r3-m1");
    assert.equal(parent.sideColumn, "side_a_player_id");
  });

  it("moves an emitted provider id off a later-round holder that is not the bound hole", () => {
    const holder = side("r1-m4", 1, 4, "pC", "pD", "8800777");
    holder.winner_player_id = "uuid-c";
    holder.settled_at = "2026-09-01T00:00:00.000Z";
    const later = side("r3-m1", 3, 1, null, "pA");
    const matchSides = [holder, later];
    const { bindings } = bindResultsByPlayerPair(
      [
        {
          id: "8800777",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      matchSides,
      { pA: "pA", pB: "pB" }
    );
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].match_key, "r3-m1");
    const plan = planProviderMatchRelocation(bindings[0], matchSides);
    assert.equal(plan.releases[0].match_key, "r1-m4");
    assert.deepEqual(plan.releases[0].patch, { provider_match_id: null });
    assert.equal(plan.assign.match_key, "r3-m1");
    const after = applyRelocation(matchSides, plan);
    assert.equal(after.get("r1-m4").provider_match_id, null);
    assert.equal(after.get("r1-m4").winner_player_id, "uuid-c");
    assert.equal(after.get("r1-m4").settled_at, "2026-09-01T00:00:00.000Z");
    assert.equal(after.get("r3-m1").provider_match_id, "8800777");
  });

  it("does not release an existing provider id when the later hole has a different canonical id", () => {
    const matchSides = [
      side("r0-m3", 0, 3, "pA", null, "8800333"),
      side("r2-m1", 2, 1, "pA", null, "8800999"),
    ];
    const { results, bindings } = bindResultsByPlayerPair(
      [
        {
          id: "8800333",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      matchSides,
      { pA: "pA", pB: "pB" }
    );
    assert.equal(results.length, 0);
    assert.equal(bindings.length, 0);
    const plan = planProviderMatchRelocation(bindings[0], matchSides);
    assert.equal(plan.releases.length, 0);
    assert.equal(plan.assign, null);
    assert.equal(matchSides[0].provider_match_id, "8800333");
    assert.equal(matchSides[1].provider_match_id, "8800999");
  });

  it("does not release an existing provider id when two later-round holes match", () => {
    const matchSides = [
      side("r1-m2", 1, 2, "pA", "pZ", "8800888"),
      side("r4-m0", 4, 0, "pA", null),
      side("r5-m0", 5, 0, null, "pB"),
    ];
    const { results, bindings, skipped } = bindResultsByPlayerPair(
      [
        {
          id: "8800888",
          player1Id: "pA",
          player2Id: "pB",
          match_winner: "pA",
          result_type: "completed",
        },
      ],
      matchSides,
      { pA: "pA", pB: "pB" }
    );
    assert.equal(results.length, 0);
    assert.equal(bindings.length, 0);
    assert.equal(skipped[0].reason, "ambiguous later-round partial");
    const plan = planProviderMatchRelocation(bindings[0], matchSides);
    assert.equal(plan.releases.length, 0);
    assert.equal(plan.assign, null);
    assert.equal(matchSides[0].provider_match_id, "8800888");
  });
});

function applyRelocation(matchSides, plan) {
  const by = new Map(matchSides.map((row) => [row.match_key, { ...row }]));
  for (const rel of plan.releases) Object.assign(by.get(rel.match_key), rel.patch);
  if (plan.assign) Object.assign(by.get(plan.assign.match_key), plan.assign.patch);
  return by;
}

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

describe("archive allow-list", () => {
  function side(match_key, round, index_in_round, a, b, provider_match_id = null) {
    return {
      match_key,
      round,
      index_in_round,
      side_a_provider_id: a,
      side_b_provider_id: b,
      provider_match_id,
    };
  }

  const rows = [
    { id: "100", player1Id: "1", player2Id: "2", match_winner: "1" },
    { id: "200", player1Id: "3", player2Id: "4", match_winner: "3" },
    { id: "300", player1Id: "5", player2Id: "6", match_winner: "5" },
  ];
  const matchSides = [
    side("r0-m0", 0, 0, "1", "2"),
    side("r0-m1", 0, 1, "3", "4"),
    side("r2-m0", 2, 0, "5", null),
  ];
  const players = { "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6" };
  const seats = [
    { position: 0, provider_player_id: "1" },
    { position: 1, provider_player_id: "2" },
    { position: 2, provider_player_id: "3" },
    { position: 3, provider_player_id: "4" },
    { position: 4, provider_player_id: "7" },
    { position: 5, provider_player_id: "8" },
  ];
  const storedMatches = [
    { id: "r0-m0", provider_match_id: "100", match_key: "r0-m0" },
    { id: "r0-m9", provider_match_id: "999", match_key: "r0-m9" },
  ];

  function plan(allowIds) {
    return planArchiveResults({
      rows,
      allowIds,
      matchSides,
      players,
      mapping: { players, matches: { "100": "r0-m0", "200": "r0-m1" } },
      seats,
      knownProviderMatchIds: [],
      storedMatches,
    });
  }

  function idsOf(list, key = "provider_match_id") {
    return list.map((row) => String(row[key] ?? row.id ?? "")).sort();
  }

  it("keeps the full archive when the allow-list is omitted", () => {
    const full = plan(null);
    const direct = bindResultsByPlayerPair(rows, matchSides, players);
    assert.deepEqual(
      full.providerIdUpdates.map((b) => b.match_key).sort(),
      direct.bindings.map((b) => b.match_key).sort()
    );
    assert.deepEqual(
      full.applyResults.map((r) => r.match_key).sort(),
      direct.results.map((r) => r.match_key).sort()
    );
    assert.equal(full.archiveRows.length, 3);
    assert.equal(full.authDiff.orphans.some((o) => o.provider_match_id === "999"), true);
  });

  it("sends only one allowed archive row to bind, apply, Shape B, and provider-id updates", () => {
    const one = plan(["300"]);
    assert.deepEqual(one.archiveRows.map((r) => String(r.id)), ["300"]);
    assert.deepEqual(idsOf(one.providerIdUpdates), ["300"]);
    assert.deepEqual(one.applyResults.map((r) => r.match_key), ["r2-m0"]);
    assert.equal(one.providerIdUpdates[0].bound_by, "partial");
    assert.deepEqual(idsOf(one.unbound), []);
    assert.deepEqual(idsOf(one.shapeB), []);
    assert.equal(one.authDiff.orphans.length, 0);
  });

  it("does not bind or update a match for an excluded archive row", () => {
    const kept = plan(["100"]);
    assert.deepEqual(idsOf(kept.providerIdUpdates), ["100"]);
    assert.deepEqual(kept.applyResults.map((r) => r.match_key), ["r0-m0"]);
    assert.equal(kept.bound.results.some((r) => r.provider_match_id === "200"), false);
    assert.equal(kept.mapped.results.some((r) => r.match_key === "r0-m1"), false);
    assert.equal(kept.shapeB.some((r) => r.provider_match_id === "200"), false);
    assert.equal(kept.unbound.some((r) => r.provider_match_id === "200"), false);
    assert.equal(kept.authDiff.orphans.some((o) => o.provider_match_id === "999"), false);
  });

  it("proposes Shape B only for an allowed archive row", () => {
    const planned = planArchiveResults({
      rows: [
        { id: "10", player1Id: "7", player2Id: "8", match_winner: "7" },
        { id: "11", player1Id: "1", player2Id: "2", match_winner: "1" },
      ],
      allowIds: ["11"],
      matchSides: [],
      players: { "1": "1", "2": "2", "7": "7", "8": "8" },
      seats,
    });
    assert.deepEqual(planned.shapeB.map((row) => row.provider_match_id), ["11"]);
    assert.equal(planned.unbound.some((row) => row.provider_match_id === "10"), false);
    assert.equal(planned.providerIdUpdates.length, 0);
  });

  it("accepts several allowed ids and ignores an unknown id", () => {
    const many = plan(["100", "200", "404"]);
    assert.deepEqual(many.archiveRows.map((r) => String(r.id)).sort(), ["100", "200"]);
    assert.deepEqual(idsOf(many.providerIdUpdates), ["100", "200"]);
    assert.deepEqual(many.applyResults.map((r) => r.match_key).sort(), ["r0-m0", "r0-m1"]);
    assert.equal(many.applyResults.some((r) => r.match_key === "r2-m0"), false);
  });

  it("still refuses R0 as a partial target", () => {
    const planned = planArchiveResults({
      rows: [{ id: "8800222", player1Id: "pA", player2Id: "pB", match_winner: "pA" }],
      allowIds: ["8800222"],
      matchSides: [
        side("r0-m4", 0, 4, "pA", null, "8800222"),
        side("r2-m2", 2, 2, null, "pA"),
      ],
      players: { pA: "pA", pB: "pB" },
    });
    assert.equal(planned.providerIdUpdates.length, 1);
    assert.equal(planned.providerIdUpdates[0].match_key, "r2-m2");
    assert.equal(planned.providerIdUpdates[0].bound_by, "partial");
    assert.equal(planned.applyResults[0].match_key, "r2-m2");
  });

  it("still fails closed when several later-round candidates match one archive row", () => {
    const planned = planArchiveResults({
      rows: [{ id: "8800111", player1Id: "pA", player2Id: "pB", match_winner: "pA" }],
      allowIds: [8800111],
      matchSides: [
        side("r2-m0", 2, 0, "pA", null),
        side("r2-m1", 2, 1, null, "pA"),
      ],
      players: { pA: "pA", pB: "pB" },
    });
    assert.equal(planned.providerIdUpdates.length, 0);
    assert.equal(planned.applyResults.length, 0);
    assert.equal(planned.bound.skipped[0].reason, "ambiguous later-round partial");
  });

  it("skips draw provider-id writes when an allow-list is present and still settles the allowed row", () => {
    const seats = [0, 1, 2, 3].map((position) => {
      const names = [
        ["Ada", "Alpha"],
        ["Bea", "Bravo"],
        ["Cam", "Gamma"],
        ["Dee", "Delta"],
      ];
      const [given, last] = names[position];
      return {
        position,
        seat_kind: "player",
        last_name: last,
        given_name: given,
        player_ref: `p-${position}`,
        country_code: "USA",
        display_name: `${given} ${last}`,
      };
    });
    const fixtures = [
      {
        id: "1001",
        player1Id: "1",
        player2Id: "2",
        player1: { id: "1", name: "Ada Alpha" },
        player2: { id: "2", name: "Bea Bravo" },
      },
      {
        id: "1002",
        player1Id: "3",
        player2Id: "4",
        player1: { id: "3", name: "Cam Gamma" },
        player2: { id: "4", name: "Dee Delta" },
      },
    ];
    const archive = [
      {
        id: "2001",
        player1Id: "1",
        player2Id: "2",
        player1: { id: "1", name: "Ada Alpha" },
        player2: { id: "2", name: "Bea Bravo" },
        match_winner: "1",
      },
      {
        id: "2002",
        player1Id: "3",
        player2Id: "4",
        player1: { id: "3", name: "Cam Gamma" },
        player2: { id: "4", name: "Dee Delta" },
        match_winner: "3",
      },
    ];
    const full = overlayOfficialDraw(seats, fixtures, { results: archive, prefix: "atp" });
    assert.equal(full.ok, true);
    if (!full.ok) throw new Error(full.reason);
    assert.equal(full.matches["2001"], "r0-m0");
    assert.equal(full.matches["2002"], "r0-m1");

    assert.equal(shouldReconcileDraw(null), true);
    assert.equal(shouldReconcileDraw(undefined), true);
    assert.deepEqual(drawProviderMatchWrites(null, full.matches), full.matches);
    assert.ok(drawProviderMatchWrites(null, full.matches)["2002"]);

    const filteredOverlay = overlayOfficialDraw(seats, fixtures, {
      results: archive.filter((row) => row.id === "2001"),
      prefix: "atp",
    });
    assert.equal(filteredOverlay.ok, true);
    if (!filteredOverlay.ok) throw new Error(filteredOverlay.reason);
    assert.equal(filteredOverlay.matches["1002"], "r0-m1");

    assert.equal(shouldReconcileDraw(["2001"]), false);
    assert.deepEqual(drawProviderMatchWrites(["2001"], full.matches), {});
    assert.equal(drawProviderMatchWrites(["2001"], full.matches)["2002"], undefined);
    assert.equal(drawProviderMatchWrites(["2001"], filteredOverlay.matches)["1002"], undefined);

    const planned = planArchiveResults({
      rows: archive,
      allowIds: ["2001"],
      matchSides: [
        side("r0-m0", 0, 0, "1", "2"),
        side("r0-m1", 0, 1, "3", "4"),
      ],
      players: { "1": "1", "2": "2", "3": "3", "4": "4" },
    });
    assert.deepEqual(planned.archiveRows.map((row) => String(row.id)), ["2001"]);
    assert.deepEqual(planned.applyResults.map((row) => row.match_key), ["r0-m0"]);
    assert.equal(planned.applyResults[0].winner_provider_id, "1");
    assert.equal(planned.applyResults.some((row) => row.provider_match_id === "2002"), false);
    assert.equal(planned.providerIdUpdates.some((row) => row.provider_match_id === "2002"), false);
  });

  it("keeps full-pair binding when the allow-list includes that row", () => {
    const open = plan(null);
    const listed = plan(["100"]);
    const openPair = open.providerIdUpdates.find((b) => b.provider_match_id === "100");
    const listedPair = listed.providerIdUpdates.find((b) => b.provider_match_id === "100");
    assert.equal(openPair.bound_by, "pair");
    assert.equal(listedPair.bound_by, "pair");
    assert.equal(listedPair.match_key, openPair.match_key);
    assert.equal(listed.applyResults[0].winner_provider_id, "1");
  });
});
