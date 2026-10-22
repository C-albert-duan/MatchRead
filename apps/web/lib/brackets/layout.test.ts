import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRoundStructure,
  feederMatchKeys,
} from "../../../../packages/core/src/bracket.ts";
import { connectorPair, matchSlotTopUnits, relevantRoundIndex } from "./layout.ts";

function indexOf(key: string): number {
  const match = key.match(/-m(\d+)$/);
  assert.ok(match);
  return Number(match[1]);
}

test("each parent slot sits on the midpoint of its feeders for every draw size", () => {
  for (const drawSize of [4, 8, 16, 32, 128]) {
    const rounds = buildRoundStructure(drawSize);
    assert.equal(rounds.length, Math.log2(drawSize));
    assert.equal(rounds[0].matches.length, drawSize / 2);
    assert.equal(rounds.at(-1)?.matches.length, 1);

    for (const round of rounds) {
      for (const match of round.matches) {
        const feeders = feederMatchKeys(match.round, match.indexInRound);
        if (!feeders) continue;
        const parent = matchSlotTopUnits(match.round, match.indexInRound);
        const top = matchSlotTopUnits(match.round - 1, indexOf(feeders[0]));
        const bottom = matchSlotTopUnits(match.round - 1, indexOf(feeders[1]));
        assert.equal(parent, (top + bottom) / 2, match.key);
      }
    }

    const firstRound = rounds[0].matches.length;
    const finalRound = rounds.length - 1;
    assert.equal(
      matchSlotTopUnits(finalRound, 0),
      (firstRound - 1) / 2,
      `final of ${drawSize}`
    );

    for (const round of rounds) {
      if (round.index === 0) continue;
      for (const match of round.matches) {
        const feeders = feederMatchKeys(match.round, match.indexInRound);
        assert.ok(feeders);
        assert.equal(connectorPair(indexOf(feeders[0])), "a");
        assert.equal(connectorPair(indexOf(feeders[1])), "b");
      }
    }
  }
});

test("the relevant round is the earliest unfinished column", () => {
  assert.equal(relevantRoundIndex([]), 0);
  assert.equal(
    relevantRoundIndex([
      { round: 0, official: false },
      { round: 1, official: false },
    ]),
    0
  );
  assert.equal(
    relevantRoundIndex([
      { round: 0, official: true },
      { round: 0, official: true },
      { round: 1, official: false },
      { round: 2, official: false },
    ]),
    1
  );
  assert.equal(
    relevantRoundIndex([
      { round: 0, official: true },
      { round: 1, official: true },
      { round: 2, official: true },
    ]),
    2
  );
});
