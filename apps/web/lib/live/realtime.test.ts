import assert from "node:assert/strict";
import { test } from "node:test";
import {
  liveTournamentChangeFilter,
  liveTournamentIds,
  liveTournamentTopic,
  liveTournamentWatches,
} from "./realtime.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("a page with no tournament id has no realtime filter", () => {
  assert.deepEqual(liveTournamentIds([null, "", "not-an-id"]), []);
  assert.equal(liveTournamentChangeFilter(null), null);
  assert.equal(liveTournamentChangeFilter("evt-1"), null);
});

test("one tournament is one topic and one id filter", () => {
  assert.equal(liveTournamentTopic(" evt-1 "), "live:tournament:evt-1");
  assert.equal(liveTournamentChangeFilter(A.toUpperCase()), `tournament_id=eq.${A}`);
  assert.equal(liveTournamentTopic("evt-1").includes("mx-"), false);
});

test("match cells share one tournament subscription", () => {
  const watches = liveTournamentWatches([
    { tournamentRef: "evt-1", tournamentId: A },
    { tournamentRef: "evt-1", tournamentId: A.toUpperCase() },
    { tournamentRef: " evt-2 ", tournamentId: B },
    { tournamentRef: "42", tournamentId: A },
    { tournamentRef: null, tournamentId: A },
  ]);
  assert.deepEqual(watches, [
    { ref: "evt-1", tournamentId: A },
    { ref: "evt-2", tournamentId: B },
  ]);
  assert.deepEqual(
    watches.map((watch) => liveTournamentTopic(watch.ref)),
    ["live:tournament:evt-1", "live:tournament:evt-2"]
  );
});
