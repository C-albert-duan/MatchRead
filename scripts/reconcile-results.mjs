#!/usr/bin/env node
/**
 * Reconcile RapidAPI tournament results → MatchRead sync-facts (Plan 16).
 *
 * Usage (repo root):
 *   node scripts/reconcile-results.mjs --dry-run --map .provider-map.json
 *   node scripts/reconcile-results.mjs --map .provider-map.json
 *   npm run reconcile:results -- --dry-run --map .provider-map.example.json
 *
 * Env (.env.provider):
 *   RAPIDAPI_KEY, RAPIDAPI_HOST
 *   MATCHREAD_INGEST_URL, INGEST_SECRET   (required unless --dry-run)
 *   MATCHREAD_INGEST_URL may still end in /ingest-events — rewritten to /sync-facts.
 *
 * Live POST invokes sync-facts with `{ slug }` when the map has tournament_slug/slug;
 * otherwise dry-run mapping only (legacy results payload is not accepted by sync-facts).
 *
 * Never run this from Vercel. Never print the API key.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createClient,
  getTournamentResults,
  mapResultsToIngest,
} from "@matchread/provider-rapidapi";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    mapPath: null,
    doubles: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--doubles") out.doubles = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--map") out.mapPath = argv[++i];
    else if (a.startsWith("--map=")) out.mapPath = a.slice(6);
  }
  return out;
}

function usage() {
  console.log(`Reconcile RapidAPI results → ingest-events

  --map <file>   Mapping JSON (required). See .provider-map.example.json
  --dry-run      Fetch + map only; do not POST
  --doubles      Include doubles results (default: singles only)
  --help         Show this help
`);
}

/** Prefer sync-facts; fall back to legacy ingest-events URL shape. */
function syncFactsUrl(ingestUrl) {
  if (!ingestUrl) return "";
  return ingestUrl
    .replace(/\/ingest-events\/?$/, "/sync-facts")
    .replace(/\/rebuild-draw\/?$/, "/sync-facts");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const env = {
    ...loadEnvFile(resolve(process.cwd(), ".env.provider")),
    ...process.env,
  };

  if (!args.mapPath) {
    console.error("Missing --map <file>. See .provider-map.example.json");
    usage();
    process.exit(1);
  }

  const mapFile = resolve(process.cwd(), args.mapPath);
  if (!existsSync(mapFile)) {
    console.error(`Map file not found: ${mapFile}`);
    process.exit(1);
  }

  const mapping = JSON.parse(readFileSync(mapFile, "utf8"));
  if (!mapping.tournament_id || !mapping.provider_tournament_id) {
    console.error("Map needs tournament_id and provider_tournament_id");
    process.exit(1);
  }
  if (!mapping.players || !mapping.matches) {
    console.error("Map needs players{} and matches{} objects");
    process.exit(1);
  }

  const key = env.RAPIDAPI_KEY;
  const host = env.RAPIDAPI_HOST || "tennis-api-atp-wta-itf.p.rapidapi.com";
  if (!key || key.startsWith("<")) {
    console.error("RAPIDAPI_KEY missing in .env.provider");
    process.exit(1);
  }

  const tour = mapping.tour === "wta" ? "wta" : "atp";
  const client = createClient({ key, host });

  console.log(
    `Fetching ${tour} tournament results for provider id ${mapping.provider_tournament_id}…`
  );
  const { singles, doubles } = await getTournamentResults(
    client,
    tour,
    mapping.provider_tournament_id
  );
  const pool = args.doubles ? [...singles, ...doubles] : singles;
  console.log(
    `Provider returned singles=${singles.length} doubles=${doubles.length} (using ${pool.length})`
  );

  const { results, skipped } = mapResultsToIngest(pool, mapping);
  console.log(`Mapped ${results.length} ingest row(s); skipped ${skipped.length}`);
  if (skipped.length) {
    console.log("Skipped (first 15):");
    for (const s of skipped.slice(0, 15)) {
      console.log(`  ${s.id}: ${s.reason}`);
    }
    if (skipped.length > 15) console.log(`  … +${skipped.length - 15} more`);
  }

  const payload = {
    tournament_id: mapping.tournament_id,
    results,
  };

  console.log("\nPayload:");
  console.log(JSON.stringify(payload, null, 2));

  if (args.dryRun) {
    console.log("\nDry-run complete — no ingest POST.");
    process.exit(results.length ? 0 : 2);
  }

  if (!results.length) {
    console.error("Nothing to ingest (all skipped). Exiting.");
    process.exit(2);
  }

  const ingestUrl = syncFactsUrl(env.MATCHREAD_INGEST_URL || "");
  const ingestSecret = env.INGEST_SECRET;
  if (!ingestUrl || !ingestSecret) {
    console.error(
      "MATCHREAD_INGEST_URL and INGEST_SECRET required for live ingest (or pass --dry-run)."
    );
    process.exit(1);
  }

  const slug = mapping.tournament_slug || mapping.slug || null;
  if (!slug) {
    console.error(
      "Map needs tournament_slug (or slug) for live sync-facts. Dry-run still works without it."
    );
    process.exit(1);
  }

  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ slug }),
  });
  const text = await res.text();
  console.log(`\nIngest status=${res.status}`);
  console.log(text.slice(0, 800));
  if (!res.ok) process.exit(1);
  console.log(
    "\nOK — sync-facts invoked. Settle from the app (commissioner/founder) so standings move."
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
