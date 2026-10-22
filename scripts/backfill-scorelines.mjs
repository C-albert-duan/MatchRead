#!/usr/bin/env node
/**
 * Fill missing official scorelines from the completed-results archive.
 * One results request per tournament. Does not change winners.
 *
 *   npm run backfill:scorelines
 *   npm run backfill:scorelines -- --slug <slug>
 *   npm run backfill:scorelines -- --provider-id <id>
 *   npm run backfill:scorelines -- --write
 *
 * Default is dry-run. --write updates official_score and fact_kind only
 * where official_score is still null, so a restart continues the rest.
 * Needs RAPIDAPI_KEY. Reads need the Supabase URL plus anon or service role.
 * --write needs SUPABASE_SERVICE_ROLE_KEY.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  createClient as createRapid,
  getTournamentResults,
  planScorelineBackfill,
} from "@matchread/provider-rapidapi";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function parseArgs(argv) {
  const out = {
    write: false,
    slug: null,
    providerId: null,
    delayMs: 400,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--write") out.write = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--slug") out.slug = argv[++i] || null;
    else if (arg.startsWith("--slug=")) out.slug = arg.slice(7);
    else if (arg === "--provider-id") out.providerId = argv[++i] || null;
    else if (arg.startsWith("--provider-id=")) out.providerId = arg.slice(14);
    else if (arg === "--delay-ms") out.delayMs = Number(argv[++i] || 400);
    else if (arg.startsWith("--delay-ms=")) out.delayMs = Number(arg.slice(11));
  }
  return out;
}

function usage() {
  console.log(`Backfill missing official scorelines from the results archive.

  --slug <slug>           One tournament
  --provider-id <id>      One provider tournament id
  --delay-ms <n>          Pause between archive requests (default 400)
  --write                 Apply fills. Omitted = dry-run
  --help

Dry-run prints fills, score conflicts, winner conflicts, and unmatched rows.
It does not update matches. A later --write sets official_score only while
that column is null, and never writes winner_player_id.
`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}

const env = {
  ...loadEnvFile(resolve(process.cwd(), ".env.provider")),
  ...loadEnvFile(resolve(process.cwd(), "apps/web/.env.local")),
  ...process.env,
};

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
const readKey =
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const rapidKey = env.RAPIDAPI_KEY || "";

if (!supabaseUrl || !readKey || !rapidKey || rapidKey.startsWith("<")) {
  console.error(
    "BLOCKED: need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), a Supabase key, and RAPIDAPI_KEY. No scorelines were written."
  );
  process.exit(2);
}

if (args.write && !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "BLOCKED: --write needs SUPABASE_SERVICE_ROLE_KEY. Dry-run was not applied as a write."
  );
  process.exit(2);
}

const admin = createClient(supabaseUrl, readKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rapid = createRapid({
  key: rapidKey,
  host: env.RAPIDAPI_HOST || undefined,
});

const tournaments = [];
for (let from = 0; ; from += 500) {
  let tourneyQuery = admin
    .from("tournaments")
    .select("id, slug, tour, provider_id")
    .not("provider_id", "is", null)
    .not("published_at", "is", null)
    .order("slug")
    .range(from, from + 499);
  if (args.slug) tourneyQuery = tourneyQuery.eq("slug", args.slug);
  if (args.providerId) tourneyQuery = tourneyQuery.eq("provider_id", args.providerId);
  const { data, error: tourneyError } = await tourneyQuery;
  if (tourneyError) {
    console.error(`tournament read failed: ${tourneyError.message}`);
    process.exit(1);
  }
  tournaments.push(...(data ?? []));
  if (!data || data.length < 500) break;
}

const totals = {
  tournaments: 0,
  fills: 0,
  written: 0,
  conflicts: 0,
  unmatchedLocal: 0,
  unmatchedArchive: 0,
  skippedUnsettled: 0,
  unchanged: 0,
  failed: 0,
};

console.log(
  args.write
    ? "WRITE: set official_score and fact_kind only where official_score is null. winner_player_id is not updated."
    : "DRY-RUN: no matches will be updated. Pass --write to apply fills."
);
console.log(
  `scope tournaments=${(tournaments ?? []).length} delayMs=${args.delayMs}`
);

let index = 0;
for (const event of tournaments ?? []) {
  index += 1;
  const { data: matchRows, error: matchError } = await admin
    .from("matches")
    .select(
      "id, round, index_in_round, provider_match_id, side_a_player_id, side_b_player_id, winner_player_id, voided, settled_at, official_score, fact_kind"
    )
    .eq("tournament_id", event.id);
  if (matchError) {
    totals.failed += 1;
    console.error(
      `[${index}/${(tournaments ?? []).length}] ${event.slug} match read failed: ${matchError.message}`
    );
    if (/official_score/.test(matchError.message)) {
      console.error(
        "official_score is missing. Apply migration 0022 before this backfill. No rows were written."
      );
      process.exit(1);
    }
    continue;
  }

  const missing = (matchRows ?? []).filter(
    (row) => row.settled_at && !String(row.official_score || "").trim()
  );
  if (!missing.length) {
    console.log(
      `[${index}/${(tournaments ?? []).length}] ${event.slug} missing=0 skip`
    );
    continue;
  }

  totals.tournaments += 1;
  if (index > 1) await sleep(args.delayMs);

  let singles = [];
  try {
    const body = await getTournamentResults(rapid, event.tour, event.provider_id);
    singles = body.singles ?? [];
  } catch (err) {
    totals.failed += 1;
    console.error(
      `[${index}/${(tournaments ?? []).length}] ${event.slug} archive failed: ${err?.message || err}`
    );
    continue;
  }

  const playerIds = [
    ...new Set(
      (matchRows ?? [])
        .flatMap((row) => [row.side_a_player_id, row.side_b_player_id, row.winner_player_id])
        .filter(Boolean)
    ),
  ];
  const { data: people, error: peopleError } = await admin
    .from("players")
    .select("id, provider_id")
    .in(
      "id",
      playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"]
    );
  if (peopleError) {
    totals.failed += 1;
    console.error(
      `[${index}/${(tournaments ?? []).length}] ${event.slug} player read failed: ${peopleError.message}`
    );
    continue;
  }
  const providerByUuid = new Map(
    (people ?? []).filter((row) => row.provider_id).map((row) => [row.id, String(row.provider_id)])
  );
  const players = {};
  for (const row of people ?? []) {
    if (row.provider_id) players[String(row.provider_id)] = String(row.id);
  }

  const plan = planScorelineBackfill({
    matches: (matchRows ?? []).map((row) => ({
      id: row.id,
      match_key: `r${row.round}-m${row.index_in_round}`,
      round: row.round,
      index_in_round: row.index_in_round,
      provider_match_id: row.provider_match_id,
      side_a_provider_id: row.side_a_player_id
        ? providerByUuid.get(row.side_a_player_id) ?? null
        : null,
      side_b_provider_id: row.side_b_player_id
        ? providerByUuid.get(row.side_b_player_id) ?? null
        : null,
      settled_at: row.settled_at,
      winner_player_id: row.winner_player_id,
      voided: row.voided,
      official_score: row.official_score,
      fact_kind: row.fact_kind,
    })),
    archiveRows: singles,
    players,
  });

  totals.fills += plan.fills.length;
  totals.conflicts += plan.conflicts.length;
  totals.unmatchedLocal += plan.unmatchedLocal.length;
  totals.unmatchedArchive += plan.unmatchedArchive.length;
  totals.skippedUnsettled += plan.skippedUnsettled.length;
  totals.unchanged += plan.unchanged.length;

  console.log(
    `[${index}/${(tournaments ?? []).length}] ${event.slug} archive=${singles.length} missing=${missing.length} fill=${plan.fills.length} conflict=${plan.conflicts.length} unmatched_local=${plan.unmatchedLocal.length} unmatched_archive=${plan.unmatchedArchive.length} unsettled=${plan.skippedUnsettled.length}`
  );
  for (const row of plan.conflicts) {
    console.log(
      `  conflict ${row.kind} ${row.match_key} existing=${JSON.stringify(row.existing)} incoming=${JSON.stringify(row.incoming)}`
    );
  }
  for (const row of plan.unmatchedLocal) {
    console.log(`  unmatched local ${row.match_key} ${row.reason}`);
  }
  for (const row of plan.unmatchedArchive) {
    if (!row.official_score) continue;
    console.log(
      `  unmatched archive ${row.provider_match_id} ${row.reason} score=${JSON.stringify(row.official_score)}`
    );
  }

  if (!args.write) continue;

  for (const fill of plan.fills) {
    const patch = {};
    if (fill.official_score) patch.official_score = fill.official_score;
    if (fill.fact_kind) patch.fact_kind = fill.fact_kind;
    let query = admin.from("matches").update(patch).eq("id", fill.match_id);
    query = fill.official_score
      ? query.is("official_score", null)
      : query.is("fact_kind", null);
    const { data: updated, error: updateError } = await query.select("id");
    if (updateError) {
      totals.failed += 1;
      console.error(`  write ${fill.match_key} failed: ${updateError.message}`);
      continue;
    }
    if (updated?.length) totals.written += 1;
  }
}

console.log(
  `done tournaments=${totals.tournaments} fill=${totals.fills} written=${totals.written} conflict=${totals.conflicts} unmatched_local=${totals.unmatchedLocal} unmatched_archive=${totals.unmatchedArchive} unsettled=${totals.skippedUnsettled} unchanged=${totals.unchanged} failed=${totals.failed} mode=${args.write ? "write" : "dry-run"}`
);
if (totals.failed) process.exit(1);
