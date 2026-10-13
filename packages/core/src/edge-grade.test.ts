import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gradeBracket, rankRows, seasonPoints } from "./grade.ts";
import { parseMatchKey as webParseMatchKey } from "../../../apps/web/lib/brackets/types.ts";
import {
  edgeRegistrySpecifiers,
  unpublishedWorkspaceNpmSpecifier,
} from "../../../scripts/edge-module-specifiers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const edge = await import("../../../supabase/functions/_shared/core.js");

const names = [
  "@matchread/core",
  "@matchread/i18n",
  "@matchread/tokens",
  "@matchread/provider-rapidapi",
];

test("npm:@matchread/core@^0.1.0 is an unpublished workspace specifier", () => {
  assert.deepEqual(
    unpublishedWorkspaceNpmSpecifier("npm:@matchread/core@^0.1.0", names),
    { name: "@matchread/core", range: "^0.1.0" }
  );
  for (const name of names) {
    assert.equal(
      unpublishedWorkspaceNpmSpecifier(`npm:${name}@^0.1.0`, names)?.name,
      name
    );
    assert.ok(unpublishedWorkspaceNpmSpecifier(`npm:${name}`, names));
  }
  assert.equal(unpublishedWorkspaceNpmSpecifier("npm:zod@^3.0.0", names), null);
  assert.equal(
    unpublishedWorkspaceNpmSpecifier(
      "https://esm.sh/@supabase/supabase-js@2.49.1",
      names
    ),
    null
  );
  assert.equal(
    unpublishedWorkspaceNpmSpecifier("../_shared/core.js", names),
    null
  );
  assert.equal(
    unpublishedWorkspaceNpmSpecifier("npm:@other/core@^0.1.0", names),
    null
  );
});

test("Edge source does not resolve private workspace packages from the npm registry", () => {
  assert.deepEqual(edgeRegistrySpecifiers(root), []);
});

function edgeOfficial(
  official: Record<string, { winnerRef: string | null; voided?: boolean }>
) {
  return Object.fromEntries(
    Object.entries(official).map(([key, row]) => [
      key,
      { winnerPlayerId: row.winnerRef, voided: row.voided },
    ])
  );
}

function assertSameGrade(
  drawSize: number,
  picks: Record<string, string>,
  official: Record<string, { winnerRef: string | null; voided?: boolean }>,
  throughRound?: number
) {
  const web = gradeBracket({ drawSize, picks, official, throughRound });
  const copied = edge.gradeBracket({
    drawSize,
    picks,
    official: edgeOfficial(official),
    throughRound,
  });
  assert.equal(copied.score, web.score);
  assert.equal(copied.correct, web.correct);
  assert.equal(copied.incorrect, web.incorrect);
  assert.equal(copied.voided, web.voided);
  assert.equal(copied.upside, web.upside);
  assert.equal(copied.maxScore, web.maxScore);
  assert.equal(copied.championPlayerId, web.championRef);
  assert.equal(copied.championAlive, web.championAlive);
}

test("workspace grade and the Edge copy score the same bracket", () => {
  const picks = { "r0-m0": "a", "r0-m1": "c", "r1-m0": "a" };
  const official = {
    "r0-m0": { winnerRef: "a", voided: false },
    "r0-m1": { winnerRef: "b", voided: false },
    "r1-m0": { winnerRef: "a", voided: false },
  };
  assertSameGrade(4, picks, official);
  const web = gradeBracket({ drawSize: 4, picks, official });
  assert.equal(web.score, 5);
  assert.equal(web.correct, 2);
  assert.equal(web.incorrect, 1);
  assert.equal(web.maxScore, 6);
});

test("a void adds no points on either grade path", () => {
  const picks = { "r0-m0": "a", "r0-m1": "b" };
  const official = {
    "r0-m0": { winnerRef: "a", voided: true },
    "r0-m1": { winnerRef: "b", voided: false },
  };
  assertSameGrade(4, picks, official);
  const web = gradeBracket({ drawSize: 4, picks, official });
  assert.equal(web.voided, 1);
  assert.equal(web.score, 1);
  assert.equal(web.correct, 1);
});

test("a voided final does not pay the champion bonus", () => {
  const picks = { "r0-m0": "a", "r0-m1": "b", "r1-m0": "a" };
  const official = {
    "r0-m0": { winnerRef: "a" },
    "r0-m1": { winnerRef: "b" },
    "r1-m0": { winnerRef: null, voided: true },
  };
  assertSameGrade(4, picks, official);
  const web = gradeBracket({ drawSize: 4, picks, official });
  assert.equal(web.score, 2);
});

test("upside counts only players still alive after the decided rounds", () => {
  const picks = { "r0-m0": "a", "r0-m1": "b", "r1-m0": "a" };
  const official = {
    "r0-m0": { winnerRef: "a" },
    "r0-m1": { winnerRef: "b" },
  };
  assertSameGrade(4, picks, official);
  const web = gradeBracket({ drawSize: 4, picks, official });
  assert.equal(web.score, 2);
  assert.equal(web.upside, 4);
});

test("the Edge copy does not read winnerRef", () => {
  const graded = edge.gradeBracket({
    drawSize: 4,
    picks: { "r0-m0": "a" },
    official: { "r0-m0": { winnerRef: "a", voided: false } },
  });
  assert.equal(graded.score, 0);
  assert.equal(graded.correct, 0);
});

test("rank and season points match on both copies", () => {
  const rows = [
    { score: 4, tieBreak: "b" },
    { score: 9, tieBreak: "a" },
    { score: 4, tieBreak: "a" },
  ];
  assert.deepEqual(edge.rankRows(rows), rankRows(rows));
  assert.equal(edge.seasonPoints(10, 100, 2), seasonPoints(10, 100, 2));
  assert.equal(edge.seasonPoints(0, 0, 2), 0);
  assert.equal(edge.maxBracketScore(128), 512);
});

test("match keys parse to the same round and index on Edge and web", () => {
  for (const key of ["r0-m3", "r2-m15", "bad", ""]) {
    const fromEdge = edge.parseMatchKey(key);
    const fromWeb = webParseMatchKey(key);
    assert.equal(fromEdge?.round ?? null, fromWeb?.round ?? null);
    assert.equal(fromEdge?.indexInRound ?? null, fromWeb?.index_in_round ?? null);
  }
});
