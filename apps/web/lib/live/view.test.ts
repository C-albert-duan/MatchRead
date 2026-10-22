import assert from "node:assert/strict";
import { test } from "node:test";
import { readLiveMatches, readLiveTournamentState } from "../../server/repositories/live.ts";
import { liveDisplayState, tournamentRefFrom } from "./view.ts";

test("a live view is canonical and drops internal and provider fields", () => {
  const view = liveDisplayState({
    match_id: "11111111-1111-4111-8111-111111111111",
    tournament_id: "22222222-2222-4222-8222-222222222222",
    public_ref: "mx-1",
    phase: "in_play",
    score_text: "6-4",
    points_text: "15-0",
    serving_side: "a",
    provisional_winner_ref: null,
    sequence: 4,
    sequence_source: "updatedAt",
    frame_key: "frame",
    source: "socket",
    stats: { payload: true },
    score: "6-0",
    points: "40-AD",
    indicator: "2",
    received_at: "2026-10-10T15:00:00.000Z",
    occurred_at: "2026-10-10T14:59:00.000Z",
  });
  assert.equal(view?.publicRef, "mx-1");
  assert.equal(view?.sets, "6-4");
  assert.equal(view?.game, "15-0");
  assert.equal(view?.flag, "live");
  const json = JSON.stringify(view);
  assert.equal(json.includes("11111111"), false);
  assert.equal(json.includes("22222222"), false);
  assert.equal(json.includes("updatedAt"), false);
  assert.equal(json.includes("socket"), false);
  assert.equal(json.includes("payload"), false);
  assert.equal(json.includes("40-AD"), false);
  assert.equal(json.includes("6-0"), false);
  assert.equal(liveDisplayState({ public_ref: "mx-1", phase: "retired", received_at: "2026-10-10T15:00:00.000Z" }), null);
});

test("tournament live state is read by public ref", async () => {
  const calls: string[] = [];
  const state = await readLiveTournamentState(
    {
      from(table) {
        return {
          select(columns) {
            return {
              eq(column: string, value: string) {
                calls.push(`${table}:${column}=${value}:${columns}`);
                if (table === "tournaments") {
                  const lookup = Promise.resolve({ data: null, error: null });
                  return Object.assign(lookup, {
                    maybeSingle: () => Promise.resolve({ data: { id: "internal-id" }, error: null }),
                  });
                }
                const rows = Promise.resolve({
                  data: [
                    {
                      public_ref: "mx-1",
                      phase: "suspended",
                      score_text: null,
                      points_text: null,
                      serving_side: null,
                      provisional_winner_ref: null,
                      received_at: "2026-10-10T15:00:00.000Z",
                      occurred_at: null,
                      match_id: "secret-id",
                    },
                  ],
                  error: null,
                });
                return Object.assign(rows, {
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                });
              },
            };
          },
        };
      },
    },
    " evt-1 "
  );
  assert.equal(state?.tournamentRef, "evt-1");
  assert.equal(state?.matches[0]?.phase, "suspended");
  assert.equal(state?.matches[0]?.flag, null);
  assert.equal(JSON.stringify(state).includes("secret-id"), false);
  assert.equal(JSON.stringify(state).includes("internal-id"), false);
  assert.equal(calls.some((call) => call.startsWith("tournaments:slug=evt-1:id")), true);
  assert.equal(
    calls.some((call) => call.startsWith("live_match_state:tournament_id=internal-id:") && !call.includes("sequence_source")),
    true
  );
  assert.equal(await readLiveTournamentState({ from: () => { throw new Error("no"); } }, "11111111-1111-4111-8111-111111111111"), null);
  assert.equal(tournamentRefFrom({ tournamentRef: " evt-1 " }), "evt-1");
  assert.equal(tournamentRefFrom({ tournamentRef: "42" }), null);
});

test("a match-ref read still returns canonical display", async () => {
  const views = await readLiveMatches(
    {
      from() {
        return {
          select() {
            return {
              in(_key: string, values: string[]) {
                assert.deepEqual(values, ["mx-1"]);
                return Promise.resolve({
                  data: [
                    {
                      public_ref: "mx-1",
                      phase: "in_play",
                      score_text: "7-6",
                      points_text: null,
                      serving_side: "b",
                      provisional_winner_ref: null,
                      received_at: "2026-10-10T15:00:00.000Z",
                      occurred_at: null,
                    },
                  ],
                  error: null,
                });
              },
            };
          },
        };
      },
    },
    [" mx-1 "]
  );
  assert.equal(views[0]?.sets, "7-6");
  assert.equal(views[0]?.serving, "b");
  assert.deepEqual(await readLiveMatches({ from: () => { throw new Error("empty"); } }, []), []);
});
