import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import {
  canonicalLiveFrame,
  deriveLiveFlags,
  liveUpsertArgs,
  normalizeLivePayload,
  officialMatchPatch,
  projectLiveFrame,
} from "./index.js";

const root = path.resolve(import.meta.dirname, "../../..");

describe("M3 trust contract", () => {
  it("keeps a live decision off official settlement", () => {
    const canon = canonicalLiveFrame({
      source: "rest",
      id: "7000001",
      matchId: "101-202-9001-1",
      status: "InPlay",
      score: "6-4,3-3",
      points: "40-30",
      indicator: "1,0",
      updatedAt: "2026-10-07T12:22:20.000Z",
    });
    const projected = projectLiveFrame(null, {
      frame: canon.frame,
      match: {
        match_id: "m-1",
        public_ref: "mx-1",
        tournament_id: "t-1",
        side_a_provider_id: "101",
        side_b_provider_id: "202",
        officially_settled: false,
      },
    });
    assert.equal(projected.officialPatch, null);
    assert.equal(projected.advance, false);
    assert.equal(
      officialMatchPatch({
        status: "live",
        winner_side: "a",
        winner_player_id: projected.state.provisional_winner_ref,
        official_score: projected.state.score_text,
        scoreline: projected.state.score_text,
        side_a_player_id: "a",
        side_b_player_id: "b",
      }),
      null
    );
    const args = liveUpsertArgs(projected.state);
    for (const key of [
      "winner_player_id",
      "official_score",
      "settled_at",
      "voided",
      "winner_side",
    ]) {
      assert.equal(Object.hasOwn(args, key), false);
    }
    const flags = deriveLiveFlags(canon.frame, Date.parse("2026-10-07T12:22:20.000Z"));
    assert.equal(flags.live, true);
    assert.equal(flags.provisional, false);
    assert.equal(flags.serving, false);
  });

  it("normalizes a live body without opening a socket", () => {
    const frames = normalizeLivePayload({
      data: [
        {
          id: "7000001",
          matchId: "101-202-9001-1",
          status: "InPlay",
          score: "1-0",
          points: "0-0",
          indicator: "0,1",
          tourType: "atp",
        },
      ],
    });
    assert.equal(frames.length, 1);
    assert.equal(frames[0].ok, true);
    assert.equal(frames[0].frame.phase, "in_play");
    assert.equal(frames[0].frame.servingProviderId, null);
  });

  it("passes the CI live-trust guard", () => {
    const result = spawnSync(process.execPath, ["scripts/ci-live-trust.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});
