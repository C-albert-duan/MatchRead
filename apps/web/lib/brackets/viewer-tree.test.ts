import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRoundStructure,
  totalMatches,
  type DrawSeat,
} from "../../../../packages/core/src/bracket.ts";
import type { OfficialResults } from "../../../../packages/core/src/grade.ts";
import { buildSyntheticBracket16 } from "../../../../packages/core/src/synthetic-bracket.ts";
import { matchScheduleCaption, type MatchScheduleRow } from "../tournaments/format.ts";
import { matchSheetPresentation } from "./resolution.ts";
import { buildViewerNodes } from "./viewer-tree.ts";

function seats(count: number): DrawSeat[] {
  return Array.from({ length: count }, (_, position) => ({
    position,
    kind: "player" as const,
    player_id: `p-${position}`,
    last_name: `S${position}`,
    seed: position === 0 ? 1 : null,
    country_code: "XXX",
  }));
}

test("the public tree keeps stored sides and does not copy a child winner", () => {
  const draw = seats(4);
  const official: OfficialResults = {
    "r0-m0": {
      winnerRef: "p-0",
      voided: false,
      officialScore: "6-4 6-2",
      factKind: "played",
    },
  };
  const schedule: Record<string, MatchScheduleRow> = {
    "r0-m0": {
      scheduled_at: "2026-08-10T14:00:00.000Z",
      has_time: true,
      external_ref: "fx-r0-m0",
      session: "day",
      court: "Court 1",
    },
    "r0-m1": {
      scheduled_at: null,
      has_time: false,
      external_ref: "fx-r0-m1",
    },
    "r1-m0": {
      scheduled_at: null,
      has_time: false,
      external_ref: "fx-r1-m0",
      side_a: {
        ref: "p-0",
        lastName: "S0",
        seed: 1,
        countryCode: "XXX",
      },
      side_b: null,
    },
  };

  const nodes = buildViewerNodes(4, draw, official, schedule);
  assert.deepEqual(
    nodes.map((node) => node.key),
    ["r0-m0", "r0-m1", "r1-m0"]
  );
  assert.equal(new Set(nodes.map((node) => node.key)).size, 3);

  const first = nodes[0];
  assert.equal(first.a.kind === "player" && first.a.ref, "p-0");
  assert.equal(first.b.kind === "player" && first.b.ref, "p-1");
  assert.equal(first.state, "official");
  assert.equal(first.score, "6-4 6-2");
  assert.equal(first.winnerRef, "p-0");
  assert.equal(first.scheduledAt, "2026-08-10T14:00:00.000Z");
  assert.equal(first.externalRef, "fx-r0-m0");
  assert.deepEqual(first.feeds, "r1-m0");

  const open = nodes[1];
  assert.equal(open.state, "scheduled");
  assert.equal(open.score, null);
  assert.equal(open.scheduledAt, null);
  assert.equal(open.winnerRef, null);

  const parent = nodes[2];
  assert.deepEqual(parent.feeders, ["r0-m0", "r0-m1"]);
  assert.equal(parent.a.kind === "player" && parent.a.lastName, "S0");
  assert.equal(parent.aSource, "stored");
  assert.equal(parent.b.kind, "dash");
  assert.equal(parent.bSource, "empty");
  assert.equal(parent.state, "scheduled");
  assert.equal(parent.timeTba, true);
  assert.equal(parent.feeds, null);
  assert.equal(first.aSource, "draw");
  assert.equal(first.timeTba, false);
  assert.equal(open.timeTba, true);
});

test("a played quarter-final stays distinct from an upcoming one", () => {
  const quarter = buildRoundStructure(16).find(
    (round) => round.playersRemaining === 8
  );
  assert.ok(quarter);
  const [playedMatch, upcomingMatch] = quarter.matches;
  assert.ok(playedMatch && upcomingMatch);

  const side = (ref: string, lastName: string) => ({
    ref,
    lastName,
    seed: null,
    countryCode: "XXX",
  });
  const nodes = buildViewerNodes(16, seats(16), {
    [playedMatch.key]: {
      winnerRef: "played-a",
      voided: false,
      officialScore: "7-6(5) 6-4",
      factKind: "played",
    },
    [upcomingMatch.key]: {
      winnerRef: null,
      voided: false,
      officialScore: "6-4 6-4",
    },
  } satisfies OfficialResults, {
    [playedMatch.key]: {
      scheduled_at: "2026-08-12T15:00:00.000Z",
      has_time: true,
      session: "day",
      court: "Court 1",
      side_a: side("played-a", "One"),
      side_b: side("played-b", "Two"),
    },
    [upcomingMatch.key]: {
      scheduled_at: "2026-08-12T18:00:00.000Z",
      has_time: true,
      session: "night",
      court: "Court 2",
      side_a: side("next-a", "Three"),
      side_b: side("next-b", "Four"),
    },
  });

  const played = nodes.find((node) => node.key === playedMatch.key);
  const upcoming = nodes.find((node) => node.key === upcomingMatch.key);
  assert.ok(played && upcoming);
  assert.equal(played.state, "official");
  assert.equal(played.score, "7-6(5) 6-4");
  assert.equal(played.winnerRef, "played-a");
  assert.equal(upcoming.state, "scheduled");
  assert.equal(upcoming.score, null);
  assert.equal(upcoming.winnerRef, null);
  assert.equal(upcoming.scheduledAt, "2026-08-12T18:00:00.000Z");
  assert.equal(upcoming.session, "night");
  assert.equal(played.a.kind, "player");
  assert.equal(upcoming.a.kind, "player");
  assert.notEqual(played.state, upcoming.state);

  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"),
    "utf8"
  );
  const officialColor = css.match(
    /\.match-cell\[data-resolution="official"\] \.match-state \{[^}]*color:\s*([^;]+);/
  );
  const scheduledColor = css.match(
    /\.match-cell\[data-resolution="scheduled"\] \.match-state \{[^}]*color:\s*([^;]+);/
  );
  assert.ok(officialColor && scheduledColor);
  assert.notEqual(officialColor[1].trim(), scheduledColor[1].trim());
});

test("a 128-draw is 127 server nodes and one client island", () => {
  const rounds = buildRoundStructure(128);
  const nodes = buildViewerNodes(128, seats(128), {}, {});
  assert.equal(rounds.length, 7);
  assert.equal(nodes.length, 127);
  assert.equal(totalMatches(128), 127);
  assert.equal(rounds.reduce((n, round) => n + round.matches.length, 0), 127);
  for (const node of nodes) {
    if (node.round === 0) {
      assert.equal(node.feeders, null);
    } else {
      assert.deepEqual(node.feeders, [
        `r${node.round - 1}-m${node.indexInRound * 2}`,
        `r${node.round - 1}-m${node.indexInRound * 2 + 1}`,
      ]);
    }
    if (node.round === rounds.length - 1) assert.equal(node.feeds, null);
    else {
      assert.equal(
        node.feeds,
        `r${node.round + 1}-m${Math.floor(node.indexInRound / 2)}`
      );
    }
  }
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../components/bracket");
  const tree = readFileSync(join(dir, "BracketTree.tsx"), "utf8");
  const sheet = readFileSync(join(dir, "PublicOfficialDraw.tsx"), "utf8");
  const seat = readFileSync(join(dir, "SeatName.tsx"), "utf8");
  const scroller = readFileSync(join(dir, "BracketScroller.tsx"), "utf8");
  assert.equal(tree.includes('"use client"'), false);
  assert.equal(tree.includes("data-public-ref"), true);
  assert.equal(tree.includes("live_match"), false);
  assert.equal(tree.includes("provisional"), false);
  assert.equal(sheet.includes('"use client"'), false);
  assert.equal(seat.includes('"use client"'), false);
  assert.equal(tree.includes("PlayerChip"), false);
  assert.equal(scroller.startsWith('"use client"'), true);
  assert.equal(scroller.includes("querySelectorAll"), true);
  assert.equal(tree.includes("tabIndex={0}"), false);
  assert.equal(tree.includes("<ol"), true);
  assert.equal(tree.includes('className="match-state'), true);
  assert.equal(seat.includes('className="bye-tag name-win">{labels.winner}'), true);
  assert.equal(/name-win" aria-hidden/.test(seat), false);
  assert.equal(scroller.includes('role: "region"'), true);
});

test("the synthetic 16-draw is the public tree", () => {
  const sheet = buildSyntheticBracket16();
  const names = new Map(sheet.players.map((player) => [player.ref, player.lastName]));
  const official: OfficialResults = {};
  const schedule: Record<string, MatchScheduleRow> = {};
  for (const match of sheet.matches) {
    if (match.winnerRef || match.officialScore || match.factKind || match.voided) {
      official[match.key] = {
        winnerRef: match.winnerRef,
        voided: match.voided,
        officialScore: match.officialScore,
        factKind: match.factKind,
      };
    }
    const storedSide = (ref: string | null) =>
      ref
        ? {
            ref,
            lastName: names.get(ref) ?? "",
            seed: null,
            countryCode: "XXX",
          }
        : null;
    schedule[match.key] = {
      scheduled_at: match.scheduledAt,
      has_time: match.hasTime,
      session: match.session,
      court: match.court,
      external_ref: match.externalRef,
      side_a: match.round === 0 ? null : storedSide(match.sideARef),
      side_b: match.round === 0 ? null : storedSide(match.sideBRef),
    };
  }

  const nodes = buildViewerNodes(sheet.drawSize, sheet.seats, official, schedule);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const rounds = buildRoundStructure(sheet.drawSize);
  assert.equal(rounds.length, 4);
  assert.equal(nodes.length, totalMatches(16));
  assert.equal(nodes.length, 15);
  assert.equal(new Set(nodes.map((node) => node.key)).size, 15);
  for (const match of sheet.matches) {
    const node = byKey.get(match.key);
    assert.ok(node);
    assert.equal(node.feeds, match.feeds);
    assert.deepEqual(node.feeders, match.feeders);
    assert.equal(node.externalRef, match.externalRef);
  }

  const labels = {
    tba: "Time to be announced",
    tbc: "Date to be confirmed",
    day: "Day",
    night: "Night",
  };
  const caption = (key: string) => {
    const node = byKey.get(key);
    assert.ok(node);
    return matchScheduleCaption(
      {
        scheduled_at: node.scheduledAt,
        has_time: node.hasTime,
        session: node.session,
        court: node.court,
      },
      null,
      "en",
      labels
    );
  };

  const officialNode = byKey.get("r0-m0");
  const night = byKey.get("r0-m1");
  const dateOnly = byKey.get("r0-m2");
  const tba = byKey.get("r0-m3");
  const parent = byKey.get("r1-m0");
  assert.ok(officialNode && night && dateOnly && tba && parent);

  assert.equal(officialNode.state, "official");
  assert.equal(matchSheetPresentation(official["r0-m0"]).labelKey, "result.official");
  assert.equal(officialNode.score, "6-4 6-3");
  assert.equal(officialNode.winnerRef, "syn16-p01");
  assert.equal(officialNode.a.kind === "player" && officialNode.a.lastName, "Alden");
  assert.equal(officialNode.session, "day");
  assert.equal(officialNode.court, "Court 1");
  assert.equal(caption("r0-m0").place, "Day · Court 1");

  assert.equal(night.state, "official");
  assert.equal(night.winnerRef, "syn16-p04");
  assert.equal(night.session, "night");
  assert.equal(night.court, "Court 2");

  assert.equal(dateOnly.state, "scheduled");
  assert.equal(matchSheetPresentation(official["r0-m2"]).labelKey, "match.scheduled");
  assert.equal(dateOnly.score, null);
  assert.equal(dateOnly.winnerRef, null);
  assert.equal(dateOnly.hasTime, false);
  assert.equal(dateOnly.session, null);
  assert.equal(dateOnly.court, null);
  assert.equal(caption("r0-m2").place, null);
  assert.match(caption("r0-m2").when ?? "", /Time to be announced/);
  assert.doesNotMatch(caption("r0-m2").when ?? "", /\d{1,2}:\d{2}/);

  assert.equal(tba.scheduledAt, null);
  assert.equal(tba.timeTba, true);
  assert.equal(tba.session, null);
  assert.equal(tba.court, null);
  assert.equal(caption("r0-m3").when, "Time to be announced");
  assert.equal(caption("r0-m3").place, null);

  assert.equal(parent.state, "scheduled");
  assert.equal(parent.aSource, "stored");
  assert.equal(parent.bSource, "stored");
  assert.equal(parent.a.kind === "player" && parent.a.ref, officialNode.winnerRef);
  assert.equal(parent.b.kind === "player" && parent.b.ref, night.winnerRef);
  assert.equal(parent.winnerRef, null);
  assert.equal(parent.score, null);
  assert.notEqual(officialNode.state, parent.state);
  assert.notEqual(officialNode.state, dateOnly.state);

  const withoutAdvancement = {
    ...schedule,
    "r1-m0": { ...schedule["r1-m0"], side_a: null, side_b: null },
  };
  const emptyParent = buildViewerNodes(
    sheet.drawSize,
    sheet.seats,
    official,
    withoutAdvancement
  ).find((node) => node.key === "r1-m0");
  assert.ok(emptyParent);
  assert.equal(emptyParent.a.kind, "dash");
  assert.equal(emptyParent.b.kind, "dash");
  assert.equal(emptyParent.aSource, "empty");
  assert.equal(emptyParent.bSource, "empty");
});
