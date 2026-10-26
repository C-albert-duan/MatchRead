import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRoundStructure, type BracketPicks } from "../bracket.ts";
import { buildSyntheticBracket16 } from "../synthetic-bracket.ts";
import {
  MATTERS_FLOOR,
  matters,
  reasonsFor,
  type ConsequenceContext,
  type ConsequenceMatch,
  type Reason,
} from "./consequence.ts";
import { classify, DEFAULT_IMPORTANCE, matchConsequence } from "./importance.ts";
import { rankMyMatches, type RankableMatch } from "./my-matches.ts";

const sheet = buildSyntheticBracket16();
const ref = (position: number) => sheet.seats.find((seat) => seat.position === position)!.player_id!;

/** Side a wins everywhere, so the seat-0 player is the champion. */
function sideAPicks(): BracketPicks {
  const picks: BracketPicks = {};
  for (const round of buildRoundStructure(16)) {
    for (const match of round.matches) {
      picks[match.key] =
        round.index === 0
          ? ref(match.indexInRound * 2)
          : picks[`r${round.index - 1}-m${match.indexInRound * 2}`];
    }
  }
  return picks;
}

const ctx = (picks: BracketPicks, eliminated: string[] = []): ConsequenceContext => ({
  drawSize: 16,
  picks,
  eliminated: new Set(eliminated),
});

function match(partial: Partial<ConsequenceMatch> & { matchKey: string }): ConsequenceMatch {
  return {
    status: "scheduled",
    sideARef: null,
    sideBRef: null,
    winnerRef: null,
    leader: null,
    pointFlags: null,
    ...partial,
  };
}

const r0m0 = { matchKey: "r0-m0", sideARef: ref(0), sideBRef: ref(1) };
const r0m2 = { matchKey: "r0-m2", sideARef: ref(4), sideBRef: ref(5) };

test("a break point against the pick is priority 0 and critical", () => {
  const reasons = reasonsFor(
    match({ ...r0m2, status: "live", leader: "b", pointFlags: { breakPoint: "b", matchPoint: null } }),
    ctx(sideAPicks())
  );
  assert.deepEqual(reasons[0], {
    prio: 0,
    kind: "flag",
    params: { flag: "break-point", against: true, playerRef: ref(4) },
  });
  assert.equal(classify(reasons), "critical");
});

test("a match point outranks a break point in the flag it names", () => {
  const reasons = reasonsFor(
    match({ ...r0m2, status: "live", pointFlags: { breakPoint: "b", matchPoint: "b" } }),
    ctx(sideAPicks())
  );
  assert.equal(reasons[0].params.flag, "match-point");
});

test("a champion cruising is priority 2, below any threatened read", () => {
  const reasons = reasonsFor(match({ ...r0m0, status: "live", leader: "a" }), ctx(sideAPicks()));
  assert.deepEqual(reasons[0], {
    prio: 2,
    kind: "champion",
    params: { state: "on-court", playerRef: ref(0) },
  });
  assert.equal(classify(reasons), "important");
});

test("a champion trailing is priority 1; a champion out is priority 1", () => {
  const trailing = reasonsFor(match({ ...r0m0, status: "live", leader: "b" }), ctx(sideAPicks()));
  assert.deepEqual(trailing[0].params, { state: "pressure", playerRef: ref(0) });
  assert.equal(trailing[0].prio, 1);

  const out = reasonsFor(match({ ...r0m0, status: "final", winnerRef: ref(1) }), ctx(sideAPicks()));
  assert.deepEqual(out[0], { prio: 1, kind: "champion", params: { state: "out", playerRef: ref(0) } });
});

test("a flag for the pick is priority 3", () => {
  const reasons = reasonsFor(
    match({ ...r0m2, status: "live", leader: "a", pointFlags: { breakPoint: "a", matchPoint: null } }),
    ctx(sideAPicks())
  );
  assert.ok(reasons.some((r) => r.prio === 3 && r.kind === "flag" && r.params.against === false));
  assert.ok(!reasons.some((r) => r.prio === 0));
});

test("a forward pick eliminated is priority 2", () => {
  const reasons = reasonsFor(match({ ...r0m2, status: "final", winnerRef: ref(5) }), ctx(sideAPicks()));
  assert.deepEqual(reasons[0], {
    prio: 2,
    kind: "forward",
    params: { state: "eliminated", playerRef: ref(4) },
  });
});

test("a scheduled pick and its sibling are priority 6 and stay under the floor", () => {
  const reasons = reasonsFor(match(r0m2), ctx(sideAPicks()));
  assert.deepEqual(
    reasons.map((r) => [r.prio, r.kind, r.params.playerRef]),
    [
      [6, "forward", ref(4)],
      [6, "future", ref(6)],
    ]
  );
  assert.equal(MATTERS_FLOOR, 5);
  assert.equal(matters(reasons), false);
  assert.equal(classify(reasons), "normal");
});

test("an eliminated sibling pick is not a future reason", () => {
  const reasons = reasonsFor(match(r0m2), ctx(sideAPicks(), [ref(6)]));
  assert.ok(!reasons.some((r) => r.kind === "future"));
});

test("no pick involved and no input means no reason at all", () => {
  const reasons = reasonsFor(match({ ...r0m2, status: "live", leader: "b" }), ctx({}));
  assert.deepEqual(reasons, []);
  assert.equal(matters(reasons), false);
});

test("league and MatchRead inputs add alone, consensus and contrarian only when supplied", () => {
  const trailing = match({
    ...r0m2,
    status: "live",
    leader: "b",
    pickShare: { [ref(4)]: 0.72 },
    aloneOn: new Set([ref(4)]),
  });
  const kinds = reasonsFor(trailing, ctx(sideAPicks())).map((r) => `${r.prio}:${r.kind}`);
  assert.deepEqual(kinds.slice(0, 3), ["2:forward", "3:consensus", "4:alone"]);

  const lonely = match({ ...r0m2, pickShare: { [ref(4)]: 0.2 } });
  const reasons = reasonsFor(lonely, ctx(sideAPicks()));
  assert.deepEqual(reasons[0], { prio: 5, kind: "contrarian", params: { playerRef: ref(4), sharePct: 20 } });
  assert.equal(matters(reasons), true);
});

test("reasons are deterministic and sorted", () => {
  const input = match({ ...r0m0, status: "live", leader: "b", pointFlags: { breakPoint: "b", matchPoint: null } });
  const first = reasonsFor(input, ctx(sideAPicks()));
  const second = reasonsFor({ ...input }, ctx({ ...sideAPicks() }));
  assert.deepEqual(first, second);
  for (let i = 1; i < first.length; i++) assert.ok(first[i - 1].prio <= first[i].prio);
});

test("critical needs a flag; priority alone does not reach it", () => {
  const champion: Reason[] = [{ prio: 0, kind: "champion", params: {} }];
  assert.equal(classify(champion), "important");
  assert.equal(classify(champion, { ...DEFAULT_IMPORTANCE, importantAtOrBelow: -1 }), "normal");
  const flag: Reason[] = [{ prio: 0, kind: "flag", params: {} }];
  assert.equal(classify(flag, { ...DEFAULT_IMPORTANCE, criticalAtOrBelow: -1 }), "important");
});

test("matchConsequence carries domain fields only", () => {
  const reasons = reasonsFor(match({ ...r0m0, status: "live", leader: "a" }), ctx(sideAPicks()));
  const consequence = matchConsequence({
    matchRef: "syn16-r0-m0",
    reasons,
    ceilingDeltaIfLost: 31,
    affectedForwardNodes: ["r0-m0", "r1-m0"],
  });
  assert.deepEqual(Object.keys(consequence).sort(), [
    "affectedForwardNodes",
    "ceilingDeltaIfLost",
    "importance",
    "leagueRankIfLost",
    "matchRef",
    "params",
    "reason",
    "reasons",
  ]);
  assert.equal(consequence.reason, "champion");
  assert.equal(consequence.leagueRankIfLost, null);
});

test("rankMyMatches is a total order: shuffled input, same output (I5)", () => {
  const items: RankableMatch[] = [
    { matchRef: "m-final", status: "final", topPrio: 2, startsAt: "2026-10-26T10:00:00Z" },
    { matchRef: "m-live-0", status: "live", topPrio: 0, startsAt: "2026-10-26T12:00:00Z" },
    { matchRef: "m-sched-2", status: "scheduled", topPrio: 2, startsAt: "2026-10-26T15:00:00Z" },
    { matchRef: "m-live-2", status: "live", topPrio: 2, startsAt: "2026-10-26T13:00:00Z" },
    { matchRef: "m-tba", status: "scheduled", topPrio: 2, startsAt: null },
    { matchRef: "m-early", status: "scheduled", topPrio: 2, startsAt: "2026-10-26T14:00:00Z" },
    { matchRef: "m-none", status: "live", topPrio: null, startsAt: null },
  ];
  const expected = ["m-live-0", "m-live-2", "m-early", "m-sched-2", "m-tba", "m-final", "m-none"];
  assert.deepEqual(rankMyMatches(items).map((m) => m.matchRef), expected);
  for (let seed = 0; seed < 50; seed++) {
    const shuffled = [...items].sort((a, b) => ((a.matchRef.length * 31 + seed) % 7) - ((b.matchRef.length * 17 + seed) % 5));
    assert.deepEqual(rankMyMatches(shuffled).map((m) => m.matchRef), expected);
  }
});
