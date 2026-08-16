import assert from "node:assert/strict";
import { test } from "node:test";
import { pickRecentSubmittedBracket } from "./recent.ts";

test("most recent submitted bracket wins over an older one and over drafts", () => {
  const picked = pickRecentSubmittedBracket(
    [
      {
        league_id: "a",
        tournament_id: "t1",
        submitted_at: "2026-08-10T12:00:00Z",
        updated_at: "2026-08-10T12:00:00Z",
      },
      {
        league_id: "b",
        tournament_id: "t2",
        submitted_at: "2026-08-14T09:00:00Z",
        updated_at: "2026-08-14T09:00:00Z",
      },
      {
        league_id: "c",
        tournament_id: "t3",
        submitted_at: null,
        updated_at: "2026-08-16T18:00:00Z",
      },
    ],
    new Set(["a", "b", "c"])
  );
  assert.equal(picked?.league_id, "b");
});

test("ignores submitted brackets for leagues the member left", () => {
  const picked = pickRecentSubmittedBracket(
    [
      {
        league_id: "gone",
        tournament_id: "t1",
        submitted_at: "2026-08-16T12:00:00Z",
        updated_at: "2026-08-16T12:00:00Z",
      },
    ],
    new Set(["still-here"])
  );
  assert.equal(picked, null);
});
