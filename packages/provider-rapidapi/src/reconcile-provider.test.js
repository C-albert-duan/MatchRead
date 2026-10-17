import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffProviderAuthoritative,
  unboundProviderFixtures,
  r0SlotFromSeatPair,
  proposeShapeBRepairs,
  planScorelineBackfill,
  planSessionCourtBackfill,
  classifyPlayerAbsences,
  entryRowsFromInfo,
  absenceObservability,
  absenceSignalLog,
} from "./reconcile-provider.js";
import { planArchiveResults } from "./index.js";
import { outcomeDisposition } from "./normalize.js";

describe("diffProviderAuthoritative", () => {
  it("flags missing stored fixtures and orphans", () => {
    const diff = diffProviderAuthoritative(
      [{ id: "1" }, { id: "2" }, { id: "3" }],
      [
        { id: "m1", provider_match_id: "1", match_key: "r0-m0" },
        { id: "m9", provider_match_id: "9", match_key: "r0-m9" },
      ]
    );
    assert.deepEqual(diff.missingFromStore.sort(), ["2", "3"]);
    assert.equal(diff.orphans.length, 1);
    assert.equal(diff.orphans[0].provider_match_id, "9");
  });
});

describe("unboundProviderFixtures", () => {
  it("lists provider rows not bound and not already known", () => {
    const unbound = unboundProviderFixtures(
      [
        { id: "a", match_winner: "1", player1Id: "1", player2Id: "2" },
        { id: "b", match_winner: "3", player1Id: "3", player2Id: "4" },
        { id: "c", match_winner: null, player1Id: "5", player2Id: "6" },
      ],
      [{ match_key: "r0-m0", provider_match_id: "a" }],
      new Set(["c"])
    );
    assert.equal(unbound.length, 1);
    assert.equal(unbound[0].provider_match_id, "b");
    assert.equal(unbound[0].has_winner, true);
  });
});

describe("outcomeDisposition", () => {
  it("maps exceptional outcomes", () => {
    assert.equal(outcomeDisposition("retired").kind, "settle");
    assert.equal(outcomeDisposition("walkover").advances, true);
    assert.equal(outcomeDisposition("cancelled").voided, true);
    assert.equal(outcomeDisposition("suspended").kind, "skip");
    assert.equal(outcomeDisposition("mystery").kind, "unknown");
  });
});

describe("r0SlotFromSeatPair / proposeShapeBRepairs", () => {
  it("maps adjacent official seats to R0", () => {
    const slot = r0SlotFromSeatPair(
      [
        { position: 0, provider_player_id: "10" },
        { position: 1, provider_player_id: "20" },
        { position: 2, provider_player_id: "30" },
        { position: 3, provider_player_id: "40" },
      ],
      "20",
      "10"
    );
    assert.deepEqual(slot, {
      round: 0,
      index_in_round: 0,
      match_key: "r0-m0",
      side_a_provider_id: "10",
      side_b_provider_id: "20",
    });
  });

  it("proposes create when match missing", () => {
    const repairs = proposeShapeBRepairs(
      [
        {
          provider_match_id: "fx-1",
          has_winner: true,
          player1Id: "10",
          player2Id: "20",
          match_winner: "10",
          result_type: "completed",
        },
      ],
      [
        { position: 0, provider_player_id: "10" },
        { position: 1, provider_player_id: "20" },
      ],
      []
    );
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].action, "create");
    assert.equal(repairs[0].match_key, "r0-m0");
  });

  it("proposes fill when existing sides disagree with official seats", () => {
    const repairs = proposeShapeBRepairs(
      [
        {
          provider_match_id: "fx-heal",
          has_winner: true,
          player1Id: "10",
          player2Id: "20",
          match_winner: "10",
          result_type: "completed",
        },
      ],
      [
        { position: 0, provider_player_id: "10" },
        { position: 1, provider_player_id: "20" },
      ],
      [
        {
          match_key: "r0-m0",
          round: 0,
          index_in_round: 0,
          provider_match_id: "stale",
          side_a_provider_id: "99",
          side_b_provider_id: "88",
        },
      ]
    );
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].action, "fill");
    assert.equal(repairs[0].side_a_provider_id, "10");
    assert.equal(repairs[0].side_b_provider_id, "20");
  });

  it("rejects non-adjacent pairs", () => {
    assert.equal(
      r0SlotFromSeatPair(
        [
          { position: 0, provider_player_id: "10" },
          { position: 2, provider_player_id: "20" },
        ],
        "10",
        "20"
      ),
      null
    );
  });
});

describe("planScorelineBackfill", () => {
  const players = { "1": "uuid-a", "2": "uuid-b" };
  const settled = {
    id: "m1",
    match_key: "r0-m0",
    round: 0,
    index_in_round: 0,
    side_a_provider_id: "1",
    side_b_provider_id: "2",
    settled_at: "2026-08-12T00:00:00.000Z",
    winner_player_id: "uuid-a",
    voided: false,
    official_score: null,
    fact_kind: null,
  };
  const archive = {
    id: "900",
    player1Id: "1",
    player2Id: "2",
    match_winner: "1",
    result: "6-3 3-0 ret.",
    result_type: "retired",
    score: "6-4,6-3",
  };

  it("fills a missing scoreline from the archive and ignores a live score field", () => {
    const plan = planScorelineBackfill({
      matches: [settled],
      archiveRows: [archive],
      players,
    });
    assert.equal(plan.fills.length, 1);
    assert.equal(plan.fills[0].official_score, "6-3 3-0 ret.");
    assert.equal(plan.fills[0].fact_kind, "played");
    assert.equal("winner_player_id" in plan.fills[0], false);
    assert.equal(plan.conflicts.length, 0);
  });

  it("is idempotent once the stored scoreline matches", () => {
    const first = planScorelineBackfill({
      matches: [settled],
      archiveRows: [archive],
      players,
    });
    const again = planScorelineBackfill({
      matches: [
        {
          ...settled,
          official_score: first.fills[0].official_score,
          fact_kind: first.fills[0].fact_kind,
        },
      ],
      archiveRows: [archive],
      players,
    });
    assert.equal(again.fills.length, 0);
    assert.equal(again.conflicts.length, 0);
    assert.equal(again.unchanged.length, 1);
  });

  it("reports a conflicting scoreline and does not replace it", () => {
    const plan = planScorelineBackfill({
      matches: [{ ...settled, official_score: "6-4 6-2", fact_kind: "played" }],
      archiveRows: [archive],
      players,
    });
    assert.equal(plan.fills.length, 0);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].kind, "score");
    assert.equal(plan.conflicts[0].existing, "6-4 6-2");
    assert.equal(plan.conflicts[0].incoming, "6-3 3-0 ret.");
  });

  it("reports a winner conflict and does not fill that answer's score", () => {
    const plan = planScorelineBackfill({
      matches: [{ ...settled, winner_player_id: "uuid-b" }],
      archiveRows: [archive],
      players,
    });
    assert.equal(plan.conflicts.some((row) => row.kind === "winner"), true);
    assert.equal(plan.fills.length, 0);
  });

  it("reports a settled match with no archive row and an unbound archive row", () => {
    const plan = planScorelineBackfill({
      matches: [
        settled,
        {
          ...settled,
          id: "m2",
          match_key: "r0-m1",
          index_in_round: 1,
          side_a_provider_id: "8",
          side_b_provider_id: "9",
        },
      ],
      archiveRows: [
        archive,
        {
          id: "901",
          player1Id: "3",
          player2Id: "4",
          match_winner: "3",
          result: "6-0 6-0",
          result_type: "completed",
        },
      ],
      players,
    });
    assert.deepEqual(
      plan.unmatchedLocal.map((row) => row.match_key),
      ["r0-m1"]
    );
    assert.equal(plan.unmatchedArchive.length, 1);
    assert.equal(plan.unmatchedArchive[0].provider_match_id, "901");
    assert.equal(plan.unmatchedArchive[0].official_score, "6-0 6-0");
  });

  it("does not score an unsettled match", () => {
    const plan = planScorelineBackfill({
      matches: [{ ...settled, settled_at: null, winner_player_id: null }],
      archiveRows: [archive],
      players,
    });
    assert.equal(plan.fills.length, 0);
    assert.equal(plan.skippedUnsettled.length, 1);
    assert.equal(plan.skippedUnsettled[0].reason, "not settled");
  });
});

describe("classifyPlayerAbsences", () => {
  const seats = [{ provider_player_id: "p-1" }];
  const archiveRows = [
    { id: "fx-9", player1Id: "p-2", player2Id: "p-1", match_winner: "p-1" },
  ];

  it("classifies a player missing locally and upstream as a withdrawal", () => {
    const absences = classifyPlayerAbsences({
      seats,
      archiveRows,
      fixtures: [{ id: "fx-1", player1Id: "p-1", player2Id: "3700" }],
      entries: [{ id: "p-1" }],
    });
    assert.deepEqual(absences.withdrawal, ["p-2"]);
    assert.deepEqual(absences.ingestionGap, []);
    assert.deepEqual(absences.unexplained, []);
    assert.equal(absences.settleBlocked, false);
  });

  it("classifies a player missing locally but present upstream as an ingestion gap", () => {
    const onFixture = classifyPlayerAbsences({
      seats,
      archiveRows,
      fixtures: [{ id: "fx-1", player1Id: "p-2", player2Id: "p-3" }],
      entries: [],
    });
    assert.deepEqual(onFixture.ingestionGap, ["p-2", "p-3"]);
    assert.deepEqual(onFixture.withdrawal, []);
    assert.equal(onFixture.settleBlocked, true);

    const onEntry = classifyPlayerAbsences({
      seats,
      archiveRows,
      fixtures: [],
      entries: [{ id: "p-2", name: "Alpha" }],
    });
    assert.deepEqual(onEntry.ingestionGap, ["p-2"]);
    assert.equal(onEntry.settleBlocked, true);
  });

  it("leaves an absence unexplained when a source was not loaded", () => {
    const absences = classifyPlayerAbsences({
      seats,
      archiveRows,
      fixtures: null,
      entries: [],
    });
    assert.deepEqual(absences.withdrawal, []);
    assert.deepEqual(absences.unexplained, ["p-2"]);
    assert.equal(absences.settleBlocked, true);
  });

  it("ignores a player who is already on a local seat", () => {
    const absences = classifyPlayerAbsences({
      seats,
      archiveRows,
      fixtures: [],
      entries: [],
    });
    assert.deepEqual(absences.withdrawal, ["p-2"]);
    assert.equal(absences.ingestionGap.includes("p-1"), false);
    assert.equal(absences.unexplained.includes("p-1"), false);
  });

  it("treats tournament info without an entry collection as unknown", () => {
    assert.equal(entryRowsFromInfo({ name: "Event", court: "hard" }), null);
    assert.deepEqual(entryRowsFromInfo({ entries: [] }), []);
    const planned = planArchiveResults({
      rows: archiveRows,
      matchSides: [],
      seats,
      info: { name: "Event" },
      fixtures: [],
    });
    assert.deepEqual(planned.absences.unexplained, ["p-2"]);
    assert.equal(planned.absences.settleBlocked, true);
    assert.deepEqual(planned.absences.withdrawal, []);
  });
});

describe("absenceObservability", () => {
  const event = {
    ref: "evt-1",
    slug: "evt-1",
    tour: "atp",
    providerTournamentId: "9001",
    fixturesLoaded: false,
    entriesLoaded: true,
  };

  it("emits an error signal for an unexplained absence and keeps settlement closed", () => {
    const absences = classifyPlayerAbsences({
      seats: [{ provider_player_id: "p-1" }],
      archiveRows: [{ id: "fx-9", player1Id: "p-2", player2Id: "p-1" }],
      fixtures: null,
      entries: [],
    });
    assert.equal(absences.settleBlocked, true);
    const rows = absenceObservability({ ...event, absences });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "error");
    assert.equal(rows[0].name, "unexplained_absence");
    assert.equal(rows[0].payload.severity, "error");
    assert.equal(rows[0].payload.ref, "evt-1");
    assert.equal(rows[0].payload.provider_tournament_id, "9001");
    assert.deepEqual(rows[0].payload.provider_player_ids, ["p-2"]);
    assert.equal("tournament_id" in rows[0].payload, false);
    assert.equal("id" in rows[0].payload, false);
    const line = absenceSignalLog(rows[0]);
    assert.match(line, /severity=error/);
    assert.match(line, /ref=evt-1/);
    assert.match(line, /provider_tournament_id=9001/);
    assert.match(line, /provider_player_ids=p-2/);
    assert.equal(/\btournament_id=/.test(line), false);
  });

  it("emits an error signal for an ingestion gap and an info row for a withdrawal", () => {
    const gap = absenceObservability({
      ...event,
      fixturesLoaded: true,
      entriesLoaded: true,
      absences: { withdrawal: [], ingestionGap: ["p-4"], unexplained: [] },
    });
    assert.equal(gap[0].kind, "error");
    assert.equal(gap[0].name, "ingestion_gap");
    const withdrawal = absenceObservability({
      ...event,
      fixturesLoaded: true,
      entriesLoaded: true,
      absences: { withdrawal: ["p-5"], ingestionGap: [], unexplained: [] },
    });
    assert.equal(withdrawal[0].kind, "reconcile");
    assert.equal(withdrawal[0].name, "withdrawal");
    assert.equal(withdrawal[0].payload.severity, undefined);
    assert.match(absenceSignalLog(withdrawal[0]), /severity=info/);
  });
});

describe("planSessionCourtBackfill", () => {
  const surface = {
    id: 20,
    date: "2026-10-07T12:10:00.000Z",
    startTime: "2026-10-07T12:10:00.000Z",
    tournament: { court: { id: 2, name: "Clay" } },
  };

  it("writes only an explicit session or court and repeats as a no-op", () => {
    const matches = [
      { id: "m-b", round: 0, index_in_round: 1, provider_match_id: "20", session: null, court: null },
      { id: "m-a", round: 0, index_in_round: 0, provider_match_id: "10", session: null, court: null },
    ];
    const fixtures = [
      surface,
      { id: 10, session: "day", courtName: "Centre Court", startTime: "2026-10-07T18:00:00.000Z" },
    ];
    const first = planSessionCourtBackfill({ matches, fixtures });
    assert.equal(first.changed, 1);
    assert.equal(first.unchanged, 1);
    assert.equal(first.unknownSession, 1);
    assert.equal(first.unknownCourt, 1);
    assert.equal(first.missingProviderMapping, 0);
    assert.deepEqual(first.writes, [
      { match_id: "m-a", provider_match_id: "10", session: "day", court: "Centre Court" },
    ]);
    const applied = matches.map((match) => {
      const write = first.writes.find((row) => row.match_id === match.id);
      return write ? { ...match, session: write.session, court: write.court } : match;
    });
    const again = planSessionCourtBackfill({ matches: applied, fixtures });
    assert.equal(again.changed, 0);
    assert.equal(again.unchanged, 2);
    assert.deepEqual(again.writes, []);
  });

  it("does not infer session or court, and reports a missing provider id", () => {
    const plan = planSessionCourtBackfill({
      matches: [
        { id: "m-1", round: 0, index_in_round: 0, provider_match_id: null, session: null, court: null },
        { id: "m-2", round: 0, index_in_round: 1, provider_match_id: "99", session: null, court: null },
        { id: "m-3", round: 0, index_in_round: 2, provider_match_id: "20", session: "night", court: "Court 2" },
      ],
      fixtures: [surface, { id: 20, session: "evening", court: "hard" }],
    });
    assert.equal(plan.changed, 0);
    assert.equal(plan.unchanged, 3);
    assert.equal(plan.unknownSession, 2);
    assert.equal(plan.unknownCourt, 2);
    assert.equal(plan.missingProviderMapping, 2);
    assert.deepEqual(plan.writes, []);
    assert.deepEqual(plan.conflicts, []);
  });

  it("keeps a stored label when the fixture disagrees", () => {
    const plan = planSessionCourtBackfill({
      matches: [
        { id: "m-1", provider_match_id: "10", session: "day", court: "Centre Court" },
      ],
      fixtures: [{ id: 10, session: "night", courtName: "Court 3" }],
    });
    assert.equal(plan.changed, 0);
    assert.equal(plan.unchanged, 1);
    assert.equal(plan.unknownSession, 0);
    assert.equal(plan.unknownCourt, 0);
    assert.equal(plan.conflicts.length, 2);
  });

  it("picks the same fixture label when duplicate ids arrive in either order", () => {
    const labeled = { id: 10, session: "night", courtName: "Court 3" };
    const blank = { id: 10, startTime: "2026-10-07T12:10:00.000Z", court: { name: "Hard" } };
    const matches = [
      { id: "m-1", provider_match_id: "10", session: null, court: null },
    ];
    const forward = planSessionCourtBackfill({ matches, fixtures: [blank, labeled] });
    const reverse = planSessionCourtBackfill({ matches, fixtures: [labeled, blank] });
    assert.deepEqual(forward.writes, reverse.writes);
    assert.deepEqual(forward.writes, [
      { match_id: "m-1", provider_match_id: "10", session: "night", court: "Court 3" },
    ]);
  });
});
