#!/usr/bin/env node
/**
 * Publish official Mega draws (named / bye / TBD seats) via rebuild-draw.
 *
 * Usage (repo root):
 *   node scripts/publish-draws.mjs --dry-run
 *   node scripts/publish-draws.mjs
 *   node scripts/publish-draws.mjs --ref cin-2026
 *
 * Env (.env.provider):
 *   RAPIDAPI_KEY, RAPIDAPI_HOST
 *   MATCHREAD_INGEST_URL, INGEST_SECRET   (required unless --dry-run)
 *   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY  (optional listing)
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

/** Season events we always check even without a Supabase listing. */
const SEASON = [
  { ref: "cin-2026", tour: "atp", provider_tournament_id: "21347", draw_size: 128, api_name: "Cincinnati Open" },
  { ref: "cin-wta-2026", tour: "wta", provider_tournament_id: "16740", draw_size: 64, api_name: "Cincinnati Open" },
  { ref: "wsal-2026", tour: "atp", provider_tournament_id: "21348", draw_size: 64, api_name: "Winston-Salem Open" },
  { ref: "uso-2026", tour: "atp", provider_tournament_id: "21349", draw_size: 128, api_name: "US Open" },
  { ref: "uso-wta-2026", tour: "wta", provider_tournament_id: "16743", draw_size: 128, api_name: "US Open" },
  { ref: "nbo-mtl-2026", tour: "atp", provider_tournament_id: "21346", draw_size: 64, api_name: "National Bank Open - Montreal" },
  { ref: "nbo-tor-2026", tour: "wta", provider_tournament_id: "16739", draw_size: 64, api_name: "National Bank Open - Toronto" },
];

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
  const out = { dryRun: false, ref: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--ref") out.ref = argv[++i];
    else if (a.startsWith("--ref=")) out.ref = a.slice(6);
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

async function listEvents(env, onlyRef) {
  /** @type {Map<string, { ref: string, tour: string, provider_tournament_id: string, draw_size: number, name?: string }>} */
  const byRef = new Map(SEASON.map((row) => [row.ref, { ...row }]));
  const sb = supabaseRest(env);
  if (sb) {
    try {
      const rows = await restGet(
        sb,
        "tournaments?select=ref,name,tour,draw_size,provider_tournament_id&provider_tournament_id=not.is.null"
      );
      for (const row of rows) {
        if (!row?.ref || !row.provider_tournament_id) continue;
        byRef.set(row.ref, {
          ref: row.ref,
          name: row.name,
          api_name: byRef.get(row.ref)?.api_name,
          tour: row.tour === "wta" ? "wta" : "atp",
          provider_tournament_id: String(row.provider_tournament_id),
          draw_size: Number(row.draw_size) || 64,
        });
      }
    } catch (err) {
      console.warn("tournament list via REST failed:", err instanceof Error ? err.message : err);
    }
  }
  let events = [...byRef.values()];
  if (onlyRef) events = events.filter((e) => e.ref === onlyRef);
  return events;
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
  const events = await listEvents(env, args.ref);
  if (events.length === 0) {
    console.error(args.ref ? `No event ${args.ref}` : "No events to check");
    process.exit(1);
  }

  let published = 0;
  let announced = 0;
  let pending = 0;
  let skipped = 0;

  const ingestUrl = env.MATCHREAD_INGEST_URL;
  const secret = env.INGEST_SECRET;
  const rebuildUrl = ingestUrl
    ? ingestUrl.replace(/\/ingest-events\/?$/, "/rebuild-draw")
    : "";

  async function postRebuild(label, payload) {
    if (args.dryRun) {
      console.log(label, "DRY RUN — not posted");
      return;
    }
    if (!rebuildUrl || !secret) {
      console.error("Need MATCHREAD_INGEST_URL and INGEST_SECRET for live write");
      process.exit(1);
    }
    const res = await fetch(rebuildUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(label, "POST", res.status, text.slice(0, 400));
    if (!res.ok) process.exit(1);
  }

  for (const event of events) {
    const label = `${event.ref} (${event.tour} ${event.provider_tournament_id})`;
    const { fixtures } = await getTournamentFixtures(
      client,
      event.tour,
      event.provider_tournament_id
    );
    let results = [];
    try {
      const archive = await getTournamentResults(
        client,
        event.tour,
        event.provider_tournament_id
      );
      results = archive.singles ?? [];
    } catch (err) {
      console.warn(label, "results skipped —", err instanceof Error ? err.message : err);
    }
    const pairs = namedFirstRoundPairs(fixtures);
    const matchups = matchupsFromPairs(pairs, event.tour);

    if (matchups.length > 0) {
      const payload = {
        tournament_ref: event.ref,
        tournament_patch: {
          provider_tournament_id: event.provider_tournament_id,
          tour: event.tour,
        },
        matchups,
      };
      console.log(label, `announced first round ${matchups.length}`);
      await postRebuild(label, payload);
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
      tournament_ref: event.ref,
      tournament_patch: {
        draw_size: built.drawSize,
        provider_tournament_id: event.provider_tournament_id,
        tour: event.tour,
      },
      seats: built.seats,
      results: built.results ?? [],
      schedule: built.schedule ?? [],
      matches: built.matches ?? {},
      matchups,
      replace_announced: true,
    };
    const preview = resolve(process.cwd(), `tmp-${event.ref}-draw.json`);
    writeFileSync(preview, JSON.stringify(payload, null, 2) + "\n");
    console.log(label, `complete ${built.drawSize}-draw — wrote`, preview);
    await postRebuild(label, payload);
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
