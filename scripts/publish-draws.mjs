#!/usr/bin/env node
/**
 * Publish official Mega draws (named / bye / TBD seats).
 *
 * Builds seats locally (for preview), then live-writes via sync-facts
 * (which re-resolves with the deployed provider and apply-draw).
 *
 * Usage (repo root):
 *   node scripts/publish-draws.mjs --dry-run
 *   node scripts/publish-draws.mjs
 *   node scripts/publish-draws.mjs --slug t-atp-21347
 *   node scripts/publish-draws.mjs --ref t-atp-21347
 *
 * Env (.env.provider / apps/web/.env.local):
 *   RAPIDAPI_KEY, RAPIDAPI_HOST
 *   MATCHREAD_INGEST_URL, INGEST_SECRET   (required unless --dry-run)
 *   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY  (tournament listing)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createClient,
  getTournamentFixtures,
  getTournamentResults,
  namedFirstRoundPairs,
  overlayOfficialDraw,
  resolveOfficialSeats,
} from "@matchread/provider-rapidapi";

function matchupsFromPairs(pairs, prefix) {
  return pairs.map((p) => ({
    provider_match_id: String(p.id),
    match_key: `fx-${p.id}`,
    player1_ref: `${prefix}-${p.p1.id}`,
    player1_last_name: p.p1.last_name,
    player1_country: p.p1.country_code,
    player1_seed: p.p1.seed,
    player2_ref: `${prefix}-${p.p2.id}`,
    player2_last_name: p.p2.last_name,
    player2_country: p.p2.country_code,
    player2_seed: p.p2.seed,
    scheduled_at: p.instant?.scheduled_at ?? null,
    has_time: Boolean(p.instant?.has_time),
  }));
}

function matchesSlugFilter(event, only) {
  if (!only) return true;
  const needle = String(only).trim().toLowerCase();
  if (!needle) return true;
  return event.slug.toLowerCase() === needle;
}

async function listEvents(env, onlySlug) {
  const sb = supabaseRest(env);
  if (!sb) {
    throw new Error(
      "Supabase URL + anon key required to list tournaments (no hardcoded season)"
    );
  }
  const rows = await restGet(
    sb,
    "tournaments?select=slug,name,tour,draw_size,provider_id&provider_id=not.is.null"
  );
  let events = rows
    .filter((row) => row?.slug && row.provider_id)
    .map((row) => ({
      slug: row.slug,
      ref: row.slug,
      name: row.name,
      api_name: row.name,
      tour: row.tour === "wta" ? "wta" : "atp",
      provider_id: String(row.provider_id),
      provider_tournament_id: String(row.provider_id),
      draw_size: Number(row.draw_size) || 0,
    }));
  if (onlySlug) events = events.filter((e) => matchesSlugFilter(e, onlySlug));
  return events;
}

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
  const out = { dryRun: false, force: false, slug: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--force") out.force = true;
    else if (a === "--slug" || a === "--ref") out.slug = argv[++i];
    else if (a.startsWith("--slug=")) out.slug = a.slice(7);
    else if (a.startsWith("--ref=")) out.slug = a.slice(6);
  }
  return out;
}

function supabaseRest(env) {
  const ingest = env.MATCHREAD_INGEST_URL || "";
  const fromIngest = ingest.includes("/functions/v1/")
    ? ingest.replace(/\/functions\/v1\/.*$/, "")
    : "";
  const url = (
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    fromIngest
  ).replace(/\/$/, "");
  const key =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    "";
  if (!url || !key) return null;
  return { url, key };
}

async function restGet(sb, path) {
  const res = await fetch(`${sb.url}/rest/v1/${path}`, {
    headers: {
      apikey: sb.key,
      Authorization: `Bearer ${sb.key}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status} ${path}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : [];
}

/** Prefer sync-facts; fall back to legacy rebuild-draw URL shape. */
function syncFactsUrl(ingestUrl) {
  if (!ingestUrl) return "";
  return ingestUrl
    .replace(/\/ingest-events\/?$/, "/sync-facts")
    .replace(/\/rebuild-draw\/?$/, "/sync-facts");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = {
    ...loadEnvFile(resolve(process.cwd(), ".env.provider")),
    ...loadEnvFile(resolve(process.cwd(), "apps/web/.env.local")),
    ...process.env,
  };
  if (!env.RAPIDAPI_KEY) {
    console.error("Missing RAPIDAPI_KEY in .env.provider");
    process.exit(1);
  }

  const client = createClient({
    key: env.RAPIDAPI_KEY,
    host: env.RAPIDAPI_HOST,
  });
  const events = await listEvents(env, args.slug);
  if (events.length === 0) {
    console.error(args.slug ? `No event ${args.slug}` : "No events to check");
    process.exit(1);
  }

  let published = 0;
  let announced = 0;
  let pending = 0;
  let skipped = 0;

  const ingestUrl = env.MATCHREAD_INGEST_URL;
  const secret = env.INGEST_SECRET;
  const factsUrl = syncFactsUrl(ingestUrl);

  async function postSyncFacts(label, slug) {
    if (args.dryRun) {
      console.log(label, "DRY RUN — sync-facts not posted");
      return;
    }
    if (!factsUrl || !secret) {
      console.error("Need MATCHREAD_INGEST_URL and INGEST_SECRET for live write");
      process.exit(1);
    }
    const res = await fetch(factsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug,
        force: args.force,
      }),
    });
    const text = await res.text();
    console.log(label, "POST sync-facts", res.status, text.slice(0, 600));
    if (!res.ok) process.exit(1);
  }

  for (const event of events) {
    const label = `${event.slug} (${event.tour} ${event.provider_id})`;
    const { fixtures } = await getTournamentFixtures(
      client,
      event.tour,
      event.provider_id
    );
    let results = [];
    try {
      const archive = await getTournamentResults(
        client,
        event.tour,
        event.provider_id
      );
      results = archive.singles ?? [];
    } catch (err) {
      console.warn(label, "results skipped —", err instanceof Error ? err.message : err);
    }
    const pairs = namedFirstRoundPairs(fixtures);
    const matchups = matchupsFromPairs(pairs, event.tour);
    if (matchups.length > 0) {
      console.log(label, `announced first round ${matchups.length} (local preview)`);
      announced += 1;
    }

    const official = await resolveOfficialSeats(client, event, fixtures);
    if (!official.ok) {
      console.log(
        label,
        "full draw pending —",
        official.reason,
        official.firstRound || ""
      );
      pending += 1;
      continue;
    }

    const built = overlayOfficialDraw(official.seats, fixtures, {
      prefix: event.tour,
      results,
    });

    if (!built.ok) {
      console.log(label, "full draw pending —", built.reason);
      pending += 1;
      continue;
    }

    const payload = {
      tournament_slug: event.slug,
      tournament_ref: event.slug,
      tournament_patch: {
        draw_size: built.drawSize,
        provider_id: event.provider_id,
        tour: event.tour,
      },
      seats: built.seats,
      results: built.results ?? [],
      schedule: built.schedule ?? [],
      matches: built.matches ?? {},
      matchups,
      replace_announced: true,
    };
    const preview = resolve(process.cwd(), `tmp-${event.slug}-draw.json`);
    writeFileSync(preview, JSON.stringify(payload, null, 2) + "\n");
    console.log(label, `complete ${built.drawSize}-draw — wrote`, preview);

    await postSyncFacts(label, event.slug);
    published += 1;
  }

  console.log(
    `done announced=${announced} published=${published} pending=${pending} skipped_existing=${skipped}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
