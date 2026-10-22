import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const app = path.resolve(import.meta.dirname, "../../app");

/** Compare SQL fixtures across OS checkouts (LF in git; CRLF on Windows without .gitattributes). */
function normalizeSqlText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function loadingFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...loadingFiles(full));
    else if (entry.name === "loading.tsx") found.push(full);
  }
  return found;
}

test("tournament and league routes stay server documents", () => {
  assert.deepEqual(loadingFiles(app), []);
  assert.equal(existsSync(path.join(app, "matches", "[ref]", "page.tsx")), true);
  assert.equal(existsSync(path.join(app, "matches", "[ref]", "not-found.tsx")), true);
  assert.equal(existsSync(path.join(app, "(home)", "page.tsx")), true);
  const matchPage = readFileSync(path.join(app, "matches", "[ref]", "page.tsx"), "utf8");
  assert.equal(matchPage.includes("generateMetadata"), true);
  assert.equal(matchPage.includes("loadPublicMatch"), true);
  assert.equal(matchPage.includes("notFound()"), true);
  assert.equal(matchPage.includes("respondMatchRoute"), true);
  assert.equal(matchPage.includes("matchHref"), true);
  assert.equal(matchPage.includes("redirect("), false);
  assert.equal(matchPage.includes('"use client"'), false);
  assert.equal(matchPage.includes("MatchCaption"), false);
  assert.equal(matchPage.includes("data-base-resolution"), true);
  assert.equal(matchPage.includes("data-live-root"), true);
  assert.equal(matchPage.includes("data-live-badge"), false);
  assert.equal(matchPage.includes("LiveScore"), false);
  assert.equal(matchPage.includes("live_match"), false);
  assert.equal(matchPage.includes("provisional"), false);
  const detail = readFileSync(
    path.resolve(import.meta.dirname, "match-detail.ts"),
    "utf8"
  );
  assert.equal(detail.includes("official_score"), true);
  assert.equal(detail.includes("status: 404"), true);
  assert.equal(detail.includes("tournamentHref"), true);
  const home = readFileSync(path.join(app, "(home)", "page.tsx"), "utf8");
  assert.equal(home.includes('"use client"'), false);
  assert.equal(home.includes("page--landing"), true);
  assert.equal(home.includes("showBack={false}"), true);
  assert.equal(home.includes("RouteLoading"), false);
  for (const field of [
    "detail.sideA",
    "detail.sideB",
    "detail.lead",
    "detail.tournamentName",
    "detail.tournamentHref",
  ]) {
    assert.equal(matchPage.includes(field), true, field);
  }
  const tournamentPage = readFileSync(
    path.join(app, "tournaments", "[ref]", "page.tsx"),
    "utf8"
  );
  assert.equal(tournamentPage.includes('"use client"'), false);
  assert.equal(tournamentPage.includes("loadTournamentReadModel"), true);
  assert.equal(tournamentPage.includes("event.name"), true);
  assert.equal(tournamentPage.includes("<AnnouncedSheet"), true);
  assert.equal(tournamentPage.includes("<PublicOfficialDraw"), true);
  assert.equal(tournamentPage.includes("AnnouncedFirstRound"), false);
  assert.equal(tournamentPage.includes("live_match"), false);
  const sheet = readFileSync(
    path.resolve(import.meta.dirname, "../../components/bracket/AnnouncedSheet.tsx"),
    "utf8"
  );
  assert.equal(sheet.includes('"use client"'), false);
  assert.equal(sheet.includes("captionTimeZone"), true);
  assert.equal(sheet.includes("player1_last_name"), true);
  assert.equal(sheet.includes("player2_last_name"), true);
  assert.equal(sheet.includes("data-public-ref"), true);
  assert.equal(sheet.includes("data-live-root"), true);
  assert.equal(sheet.includes("match_id"), false);
});

test("the synthetic bracket scripts stay the same", () => {
  const root = path.resolve(import.meta.dirname, "../../../..");
  const fixture = readFileSync(
    path.join(root, "supabase", "fixtures", "synthetic-bracket-16.sql"),
    "utf8"
  );
  const copy = readFileSync(
    path.join(root, "supabase", "tests", "fixtures", "synthetic-bracket-16.sql"),
    "utf8"
  );
  assert.equal(normalizeSqlText(copy), normalizeSqlText(fixture));
});

test("pgTAP anon trust tests target the live schema (slug/seats/members/picks)", () => {
  const root = path.resolve(import.meta.dirname, "../../../..");
  const read = (name: string) =>
    readFileSync(path.join(root, "supabase", "tests", name), "utf8");

  const legacy = [
    "public.draw_seats",
    "public.draws",
    "public.league_members",
    "public.bracket_snapshots",
    "tournaments (ref",
    "where ref =",
  ];
  for (const file of [
    "0028_anon_public_reads.test.sql",
    "0029_anon_private_brackets.test.sql",
    "0030_anon_league_members.test.sql",
  ]) {
    const sql = read(file);
    for (const token of legacy) {
      assert.equal(sql.includes(token), false, `${file} must not reference ${token}`);
    }
  }

  assert.equal(read("0028_anon_public_reads.test.sql").includes("public.seats"), true);
  assert.equal(read("0028_anon_public_reads.test.sql").includes("slug"), true);
  assert.equal(read("0029_anon_private_brackets.test.sql").includes("public.picks"), true);
  assert.equal(read("0030_anon_league_members.test.sql").includes("public.members"), true);
});
