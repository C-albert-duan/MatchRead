import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_IMPORTANCE, matchConsequence, type Reason } from "@matchread/core";
import type { MyMatchRow, MyTennisView } from "./my-tennis.ts";
import { STAGE_TREATMENT, stageModel, stageState } from "./stage-policy.ts";
import { stableOrder } from "./stable-order.ts";

const NOW = new Date("2026-10-26T11:00:00.000Z");

function row(ref: string, partial: Partial<MyMatchRow> & { reasons?: Reason[] } = {}): MyMatchRow {
  const reasons = partial.reasons ?? [{ prio: 6, kind: "forward", params: { state: "open", playerRef: "p1" } }];
  return {
    matchRef: ref,
    matchKey: "r0-m0",
    tournamentRef: "t-1",
    tournamentId: "00000000-0000-0000-0000-0000000000a1",
    tournamentName: "Event",
    leagueId: "league-a",
    round: 0,
    status: "scheduled",
    startsAt: null,
    hasTime: false,
    session: null,
    court: null,
    sideA: { ref: "p1", lastName: "Ames" },
    sideB: { ref: "p2", lastName: "Brook" },
    pickRef: "p1",
    winnerRef: null,
    officialScore: null,
    live: null,
    matters: false,
    ...partial,
    consequence: matchConsequence(
      { matchRef: ref, reasons, ceilingDeltaIfLost: 3, affectedForwardNodes: [] },
      DEFAULT_IMPORTANCE
    ),
  };
}

function view(rows: MyMatchRow[]): MyTennisView {
  return {
    rows,
    triads: [
      { bracketId: "b", leagueId: "league-a", tournamentRef: "t-1", banked: 4, projected: 6, ceiling: 20 },
    ],
    names: {},
  };
}

test("state follows the plan's order", () => {
  assert.equal(stageState([]), "empty");
  assert.equal(stageState([row("m1")]), "morning");
  assert.equal(stageState([row("m1", { status: "live" }), row("m2", { status: "final" })]), "live");
  assert.equal(stageState([row("m1", { status: "final" }), row("m2")]), "next");
  assert.equal(stageState([row("m1", { status: "final" })]), "reckoning");
  assert.equal(stageState([row("m1")], true), "cascade");
  const critical = row("m1", {
    status: "live",
    reasons: [{ prio: 0, kind: "flag", params: { flag: "break-point", against: true } }],
  });
  assert.equal(stageState([critical]), "urgent");
});

test("urgent and cascade are not rendered in M4: they map to calm treatments", () => {
  assert.equal(STAGE_TREATMENT.urgent, "live");
  assert.equal(STAGE_TREATMENT.cascade, "next");
  for (const treatment of Object.values(STAGE_TREATMENT)) {
    assert.ok(["morning", "live", "next", "reckoning", "empty"].includes(treatment));
  }
});

test("morning counts matches in the next 24 h and picks the earliest clock", () => {
  const model = stageModel(
    view([
      row("late", { startsAt: "2026-10-26T18:00:00.000Z", hasTime: true }),
      row("soon", { startsAt: "2026-10-26T11:55:00.000Z", hasTime: true }),
      row("tba"),
      row("tomorrow", { startsAt: "2026-10-28T09:00:00.000Z", hasTime: true }),
    ]),
    NOW
  );
  assert.equal(model.treatment, "morning");
  assert.equal(model.upNext?.matchRef, "soon");
  assert.equal(model.facts.upcoming, 2);
  assert.deepEqual([model.facts.banked, model.facts.ceiling], [4, 20]);
});

test("with no published clock, the next match is still found (time to be announced)", () => {
  const model = stageModel(view([row("tba-a"), row("tba-b")]), NOW);
  assert.equal(model.upNext?.matchRef, "tba-a");
});

test("live focuses the top live row; next focuses the settled one", () => {
  const live = stageModel(
    view([row("fin", { status: "final" }), row("on", { status: "live" })]),
    NOW
  );
  assert.equal(live.focus?.matchRef, "on");

  const lost: Reason[] = [{ prio: 2, kind: "forward", params: { state: "eliminated", playerRef: "p1" } }];
  const next = stageModel(view([row("fin", { status: "final", reasons: lost }), row("later")]), NOW);
  assert.equal(next.treatment, "next");
  assert.equal(next.focus?.matchRef, "fin");
  assert.equal(next.upNext?.matchRef, "later");
  assert.equal(next.reckoning.lost, 1);
});

test("the list keeps its order below the top three", () => {
  assert.deepEqual(stableOrder([], ["a", "b", "c", "d"]), { order: ["a", "b", "c", "d"], promoted: [] });
  const moved = stableOrder(["a", "b", "c", "d", "e", "f"], ["a", "f", "b", "e", "d", "c"]);
  assert.deepEqual(moved.order, ["a", "f", "b", "c", "d", "e"]);
  assert.deepEqual(moved.promoted, ["f"]);
  const gone = stableOrder(["a", "b", "c", "d"], ["a", "b", "c", "x"]);
  assert.deepEqual(gone.order, ["a", "b", "c", "x"]);
  assert.deepEqual(stableOrder(["a", "b"], ["a", "b"]).promoted, []);
});
