#!/usr/bin/env node
/**
 * Fill null session and court from fixture rows that already name them.
 * A clock is not a session. An event surface is not a court.
 *
 *   npm run backfill:session-court
 *   npm run backfill:session-court -- --slug <slug>
 *   npm run backfill:session-court -- --provider-id <id>
 *   npm run backfill:session-court -- --write
 *   npm run backfill:session-court -- --write --confirm-remote
 *
 * Default is dry-run. Intended writes print before any update.
 * A non-local Supabase URL does not write unless --confirm-remote is set.
 * --write sets session or court only while that column is still null.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  createClient as createRapid,
  getTournamentFixtures,
  planSessionCourtBackfill,
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
    confirmRemote: false,
    slug: null,
    providerId: null,
    delayMs: 400,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--write") out.write = true;
    else if (arg === "--confirm-remote") out.confirmRemote = true;
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
  console.log(`Backfill session and court from published fixture labels.

  --slug <slug>           One tournament
  --provider-id <id>      One provider tournament id
  --delay-ms <n>          Pause between fixture requests (default 400)
  --write                 Apply fills. Omitted = dry-run
  --confirm-remote        Required with --write when the Supabase URL is not local
  --help

Dry-run prints intended writes and the counts. It does not update matches.
A write sets session or court only while that column is null.
`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function localDatabase(url) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
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
const remote = !localDatabase(supabaseUrl);

if (!supabaseUrl || !readKey || !rapidKey || rapidKey.startsWith("<")) {
  console.error(
    "BLOCKED: need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), a Supabase key, and RAPIDAPI_KEY. No session or court values were written."
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
tournaments.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));

const totals = {
  tournaments: tournaments.length,
  changed: 0,
  unchanged: 0,
  unknownSession: 0,
  unknownCourt: 0,
  missingProviderMapping: 0,
  conflicts: 0,
  written: 0,
  failed: 0,
};
/** @type {Array<{ slug: string, match_id: string, provider_match_id: string, session?: string, court?: string }>} */
const intended = [];

console.log(
  args.write
    ? "WRITE requested. Intended writes are listed before any update."
    : "DRY-RUN: no matches will be updated. Pass --write to apply fills."
);
if (remote) {
  console.log(
    "database=remote. Writes stay off unless --write and --confirm-remote are both set."
  );
}
console.log(`scope tournaments=${tournaments.length} delayMs=${args.delayMs}`);

let index = 0;
for (const event of tournaments) {
  index += 1;
  const { data: matchRows, error: matchError } = await admin
    .from("matches")
    .select("id, round, index_in_round, provider_match_id, session, court")
    .eq("tournament_id", event.id);
  if (matchError) {
    totals.failed += 1;
    console.error(
      `[${index}/${tournaments.length}] ${event.slug} match read failed: ${matchError.message}`
    );
    continue;
  }
  if (!(matchRows ?? []).length) continue;
  if (index > 1) await sleep(args.delayMs);

  let fixtures = [];
  try {
    const body = await getTournamentFixtures(rapid, event.tour, event.provider_id);
    fixtures = body.fixtures ?? [];
  } catch (err) {
    totals.failed += 1;
    console.error(
      `[${index}/${tournaments.length}] ${event.slug} fixtures failed: ${err?.message || err}`
    );
    continue;
  }

  const plan = planSessionCourtBackfill({ matches: matchRows ?? [], fixtures });
  totals.changed += plan.changed;
  totals.unchanged += plan.unchanged;
  totals.unknownSession += plan.unknownSession;
  totals.unknownCourt += plan.unknownCourt;
  totals.missingProviderMapping += plan.missingProviderMapping;
  totals.conflicts += plan.conflicts.length;
  for (const write of plan.writes) {
    intended.push({ slug: event.slug, ...write });
  }
  console.log(
    `[${index}/${tournaments.length}] ${event.slug} changed=${plan.changed} unchanged=${plan.unchanged} unknownSession=${plan.unknownSession} unknownCourt=${plan.unknownCourt} missingProviderMapping=${plan.missingProviderMapping} conflicts=${plan.conflicts.length}`
  );
}

intended.sort(
  (a, b) => a.slug.localeCompare(b.slug) || a.match_id.localeCompare(b.match_id)
);
console.log("intended writes:");
if (!intended.length) console.log("(none)");
for (const write of intended) {
  const fields = [
    write.session ? `session=${write.session}` : "",
    write.court ? `court=${write.court}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  console.log(
    `${write.slug} match=${write.match_id} provider_match_id=${write.provider_match_id} ${fields}`
  );
}
console.log(
  `changed=${totals.changed} unchanged=${totals.unchanged} unknownSession=${totals.unknownSession} unknownCourt=${totals.unknownCourt} missingProviderMapping=${totals.missingProviderMapping} conflicts=${totals.conflicts} failed=${totals.failed}`
);

const allowWrite = args.write && (!remote || args.confirmRemote);
if (!allowWrite) {
  if (args.write && remote) {
    console.error(
      "BLOCKED: remote database. No rows were written. Re-run with --write --confirm-remote after reading the intended writes."
    );
    process.exit(2);
  }
  console.log("DRY-RUN done");
  process.exit(totals.failed ? 1 : 0);
}

for (const write of intended) {
  if (write.session) {
    const { error } = await admin
      .from("matches")
      .update({ session: write.session })
      .eq("id", write.match_id)
      .is("session", null);
    if (error) {
      totals.failed += 1;
      console.error(`session write failed ${write.match_id}: ${error.message}`);
      continue;
    }
  }
  if (write.court) {
    const { error } = await admin
      .from("matches")
      .update({ court: write.court })
      .eq("id", write.match_id)
      .is("court", null);
    if (error) {
      totals.failed += 1;
      console.error(`court write failed ${write.match_id}: ${error.message}`);
      continue;
    }
  }
  totals.written += 1;
}
console.log(`written=${totals.written} failed=${totals.failed}`);
process.exit(totals.failed ? 1 : 0);
