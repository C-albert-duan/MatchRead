import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { t } from "@matchread/i18n";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  respondMatchRoute,
  type MatchDetailLabels,
} from "../lib/brackets/match-detail.ts";
import type { SheetMatchRow } from "../lib/brackets/read-model.ts";
import { isPublicMatchRef, matchHref } from "../lib/tournaments/href.ts";

const labels: MatchDetailLabels = {
  locale: "en",
  match: t("en", "match.page.open"),
  official: t("en", "result.official"),
  scheduled: t("en", "match.scheduled"),
  voided: t("en", "match.voided"),
  winner: t("en", "match.page.winner"),
  withdrawal: t("en", "match.withdrawal"),
  tba: t("en", "match.timeTba"),
  tbc: t("en", "calendar.dateTbc"),
  day: t("en", "match.session.day"),
  night: t("en", "match.session.night"),
  notFoundTitle: t("en", "match.notFound.title"),
  notFoundBody: t("en", "match.notFound.body"),
};

function sheet(partial: Partial<SheetMatchRow> = {}): SheetMatchRow {
  return {
    tournament_id: "t-1",
    tournament_ref: "syn-16",
    tournament_name: "Synthetic Bracket",
    venue_tz: "UTC",
    draw_size: 16,
    round: 0,
    index_in_round: 0,
    external_ref: "syn16-r0-m0",
    scheduled_at: "2026-08-10T14:00:00.000Z",
    has_time: true,
    session: "day",
    court: "Court 1",
    winner_player_id: "p-alden",
    voided: false,
    settled_at: "2026-08-10T16:00:00.000Z",
    official_score: "6-4 6-3",
    fact_kind: "played",
    side_a_player_id: "p-alden",
    side_a_last_name: "Alden",
    side_b_player_id: "p-berg",
    side_b_last_name: "Berg",
    winner_last_name: "Alden",
    ...partial,
  };
}

function client(row: SheetMatchRow | null): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "tournament_match_sheet");
      return {
        select() {
          return {
            eq(column: string, value: string) {
              assert.equal(column, "external_ref");
              return {
                maybeSingle: async () => ({
                  data: row && row.external_ref === value ? row : null,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function neverQueryClient(): SupabaseClient {
  return {
    from() {
      throw new Error("internal id must not be queried");
    },
  } as unknown as SupabaseClient;
}

test("a settled public match renders players, score, round, and the tournament link", async () => {
  const res = await respondMatchRoute("syn16-r0-m0", client(sheet()), labels);
  assert.equal(res.status, 200);
  assert.equal(res.location, null);
  if (res.status !== 200) return;
  assert.equal(res.detail.sideA, "Alden");
  assert.equal(res.detail.sideB, "Berg");
  assert.equal(res.detail.lead, "6-4 6-3");
  assert.equal(res.detail.round, "Round of 16");
  assert.equal(res.detail.state, "Official");
  assert.equal(res.detail.winner, "Alden");
  assert.equal(res.detail.session, "Day");
  assert.equal(res.detail.court, "Court 1");
  assert.equal(res.detail.tournamentName, "Synthetic Bracket");
  assert.equal(res.detail.tournamentHref, "/tournaments/syn-16");
  assert.equal(matchHref("syn16-r0-m0"), "/matches/syn16-r0-m0");
});

test("a scheduled public match renders players, time or TBA, round, and place when stored", async () => {
  const timed = await respondMatchRoute(
    "syn16-r0-m1",
    client(
      sheet({
        external_ref: "syn16-r0-m1",
        index_in_round: 1,
        winner_player_id: null,
        winner_last_name: null,
        settled_at: null,
        official_score: null,
        fact_kind: null,
        scheduled_at: "2026-08-10T02:00:00.000Z",
        has_time: true,
        session: "night",
        court: "Court 2",
        side_a_player_id: "p-costa",
        side_a_last_name: "Costa",
        side_b_player_id: "p-dahl",
        side_b_last_name: "Dahl",
      })
    ),
    labels
  );
  assert.equal(timed.status, 200);
  if (timed.status !== 200) return;
  assert.equal(timed.detail.sideA, "Costa");
  assert.equal(timed.detail.sideB, "Dahl");
  assert.equal(timed.detail.state, "Scheduled");
  assert.equal(timed.detail.winner, null);
  assert.equal(timed.detail.round, "Round of 16");
  assert.equal(timed.detail.session, "Night");
  assert.equal(timed.detail.court, "Court 2");
  assert.equal(timed.detail.tournamentHref, "/tournaments/syn-16");
  assert.match(timed.detail.lead, /\d{1,2}:\d{2}/);
  assert.doesNotMatch(timed.detail.lead, /Time to be announced/);

  const tba = await respondMatchRoute(
    "syn16-r0-m3",
    client(
      sheet({
        external_ref: "syn16-r0-m3",
        index_in_round: 3,
        winner_player_id: null,
        winner_last_name: null,
        settled_at: null,
        official_score: null,
        fact_kind: null,
        scheduled_at: null,
        has_time: false,
        session: null,
        court: null,
        side_a_player_id: "p-greco",
        side_a_last_name: "Greco",
        side_b_player_id: "p-holm",
        side_b_last_name: "Holm",
      })
    ),
    labels
  );
  assert.equal(tba.status, 200);
  if (tba.status !== 200) return;
  assert.equal(tba.detail.sideA, "Greco");
  assert.equal(tba.detail.sideB, "Holm");
  assert.equal(tba.detail.state, "Scheduled");
  assert.equal(tba.detail.lead, "Time to be announced");
  assert.equal(tba.detail.session, null);
  assert.equal(tba.detail.court, null);
  assert.equal(tba.detail.winner, null);
  assert.equal(tba.detail.round, "Round of 16");
});

test("an unknown public match ref is 404 with no invented match", async () => {
  const res = await respondMatchRoute("fx-missing", client(sheet()), labels);
  assert.equal(res.status, 404);
  assert.equal(res.location, null);
  if (res.status !== 404) return;
  assert.equal(res.title, "This match does not exist");
  assert.equal(res.body, "That match reference is not on a draw.");
  assert.equal(JSON.stringify(res).includes("Alden"), false);
  assert.equal(JSON.stringify(res).includes("/tournaments/syn-16"), false);
});

test("a bare numeric id or uuid is not a public match route", async () => {
  const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assert.equal(isPublicMatchRef("12345"), false);
  assert.equal(isPublicMatchRef(" 9001 "), false);
  assert.equal(isPublicMatchRef(uuid), false);
  assert.equal(matchHref("12345"), null);
  assert.equal(matchHref(uuid), null);
  assert.equal(isPublicMatchRef("syn16-r0-m0"), true);
  assert.equal(isPublicMatchRef("fx-100"), true);

  for (const ref of ["12345", " 9001 ", uuid, ""]) {
    const res = await respondMatchRoute(ref, neverQueryClient(), labels);
    assert.equal(res.status, 404, ref);
    assert.equal(res.location, null, ref);
    if (res.status !== 404) continue;
    assert.equal(res.title, "This match does not exist");
    assert.equal(res.body, "That match reference is not on a draw.");
  }
});

test("the match route uses notFound and does not redirect", () => {
  const page = readFileSync(
    path.resolve(import.meta.dirname, "../app/matches/[ref]/page.tsx"),
    "utf8"
  );
  const missing = readFileSync(
    path.resolve(import.meta.dirname, "../app/matches/[ref]/not-found.tsx"),
    "utf8"
  );
  assert.equal(page.includes("notFound()"), true);
  assert.equal(page.includes("redirect("), false);
  assert.equal(page.includes("detail.sideA"), true);
  assert.equal(page.includes("detail.lead"), true);
  assert.equal(page.includes("detail.round"), true);
  assert.equal(page.includes("detail.tournamentHref"), true);
  assert.equal(page.includes("data-tournament-id"), true);
  assert.equal(page.includes("data-tournament-ref"), true);
  assert.equal(missing.includes("redirect("), false);
  assert.equal(missing.includes("match.notFound.title"), true);
  assert.equal(missing.includes("match.notFound.body"), true);
});
