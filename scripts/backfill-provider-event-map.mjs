#!/usr/bin/env node
/**
 * Fill provider_event_map from stored live-list captures.
 * Live id is not a fixture id. A row is written only when tour, the
 * matchId tournament segment, and both player ids pick one match.
 *
 *   npm run backfill:provider-events
 *   npm run backfill:provider-events -- --write
 *   npm run backfill:provider-events -- --write --confirm-remote
 *
 * Default is dry-run. A non-local Supabase URL does not write unless
 * --confirm-remote is set. An existing row that already points at a
 * different match is left as it is.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { liveRowsFromNdjson, planProviderEventMap } from "@matchread/provider-rapidapi";

const CAPTURES = [
  "captures/live-raw.ndjson",
  "fixtures/live-capture-oct-2026/frames.ndjson",
];

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const matched = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (matched) out[matched[1]] = matched[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function parseArgs(argv) {
  const out = { write: false, confirmRemote: false, help: false };
  for (const arg of argv) {
    if (arg === "--write") out.write = true;
    else if (arg === "--confirm-remote") out.confirmRemote = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function localDatabase(url) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function usage() {
  console.log(`Backfill provider_event_map from stored live captures.

  --write            Insert missing rows. Omitted = dry-run
  --confirm-remote   Required with --write when the Supabase URL is not local
  --help

A live row maps only when tourType, the matchId tournament segment, and
both player ids pick one match. Fixture ids and player names are not used.
`);
}

async function eachPage(query) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return rows;
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
const readKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
if (!supabaseUrl || !readKey) {
  console.error(
    "BLOCKED: need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and a Supabase key. No map rows were written."
  );
  process.exit(2);
}
if (args.write && !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("BLOCKED: --write needs SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const remote = !localDatabase(supabaseUrl);
if (args.write && remote && !args.confirmRemote) {
  console.error("BLOCKED: --write to a remote database also needs --confirm-remote.");
  process.exit(2);
}

const liveRows = [];
const used = [];
for (const relative of CAPTURES) {
  const path = resolve(process.cwd(), relative);
  if (!existsSync(path)) continue;
  used.push(relative);
  liveRows.push(...liveRowsFromNdjson(readFileSync(path, "utf8")));
}
if (!used.length) {
  console.log("no capture files; nothing mapped");
  process.exit(0);
}

const admin = createClient(supabaseUrl, args.write ? env.SUPABASE_SERVICE_ROLE_KEY : readKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let tournaments;
let matchRows;
let players;
try {
  tournaments = await eachPage((from) =>
    admin
      .from("tournaments")
      .select("id, tour, provider_id")
      .not("provider_id", "is", null)
      .range(from, from + 499)
  );
  matchRows = await eachPage((from) =>
    admin
      .from("matches")
      .select("id, tournament_id, side_a_player_id, side_b_player_id")
      .range(from, from + 499)
  );
  players = await eachPage((from) =>
    admin.from("players").select("id, provider_id").range(from, from + 499)
  );
} catch (err) {
  console.error(`read failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const tourByTournament = new Map(tournaments.map((row) => [row.id, row]));
const providerByPlayer = new Map(
  players.filter((row) => row.provider_id).map((row) => [row.id, String(row.provider_id)])
);
const matches = [];
for (const row of matchRows) {
  const event = tourByTournament.get(row.tournament_id);
  if (!event?.provider_id) continue;
  matches.push({
    match_id: row.id,
    tour: event.tour,
    tournament_provider_id: String(event.provider_id),
    side_a_provider_id: row.side_a_player_id
      ? providerByPlayer.get(row.side_a_player_id) ?? null
      : null,
    side_b_provider_id: row.side_b_player_id
      ? providerByPlayer.get(row.side_b_player_id) ?? null
      : null,
  });
}

const plan = planProviderEventMap(liveRows, matches);
let existing;
try {
  existing = await eachPage((from) =>
    admin.from("provider_event_map").select("tour, provider_event_id, match_id").range(from, from + 499)
  );
} catch (err) {
  console.error(`provider_event_map read failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
const have = new Map(existing.map((row) => [`${row.tour}|${row.provider_event_id}`, row.match_id]));

const insert = [];
let same = 0;
let conflict = 0;
for (const row of plan.rows) {
  const key = `${row.tour}|${row.provider_event_id}`;
  const previous = have.get(key);
  if (!previous) insert.push(row);
  else if (previous === row.match_id) same += 1;
  else conflict += 1;
}

console.log(
  JSON.stringify({
    files: used,
    liveRows: liveRows.length,
    mapped: plan.rows.length,
    insert: insert.length,
    already: same,
    conflict,
    unmapped: plan.unmapped,
    write: args.write,
  })
);

if (!args.write || !insert.length) process.exit(0);

let written = 0;
for (let i = 0; i < insert.length; i += 100) {
  const chunk = insert.slice(i, i + 100);
  const { error } = await admin.from("provider_event_map").insert(chunk);
  if (error) {
    console.error(`insert failed: ${error.message}`);
    process.exit(1);
  }
  written += chunk.length;
}
console.log(JSON.stringify({ written }));
