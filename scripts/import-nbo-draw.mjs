#!/usr/bin/env node
/**
 * Rebuild National Bank Open week draws from RapidAPI results (pure-fact).
 *
 * Usage (repo root):
 *   node scripts/import-nbo-draw.mjs --tour atp --dry-run
 *   node scripts/import-nbo-draw.mjs --tour wta
 *   node scripts/import-nbo-draw.mjs            # both tours
 *
 * Env (.env.provider):
 *   RAPIDAPI_KEY, RAPIDAPI_HOST
 *   MATCHREAD_INGEST_URL (base …/functions/v1/ingest-events)
 *   INGEST_SECRET
 *
 * Writes .provider-map.json (ATP) and/or .provider-map-toronto.json (WTA).
 * DB writes go through Edge Function rebuild-draw.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createClient,
  getTournamentResults,
} from "@matchread/provider-rapidapi";

const DRAW_SIZE = 64;

/** @type {Record<"atp"|"wta", {
 *   tour: "atp"|"wta",
 *   ref: string,
 *   provider_tournament_id: string,
 *   name: string,
 *   mapFile: string,
 *   previewFile: string,
 *   prefix: string,
 *   delete_tournament_refs?: string[],
 *   montreal_name_labels?: string[],
 * }>} */
const TOURS = {
  atp: {
    tour: "atp",
    ref: "uso-2026",
    provider_tournament_id: "21346",
    name: "National Bank Open Montreal 2026",
    mapFile: ".provider-map.json",
    previewFile: "tmp-montreal-rebuild-payload.json",
    prefix: "atp",
    delete_tournament_refs: ["rg-2026", "wim-2026"],
    montreal_name_labels: [
      "Roland Garros 2026",
      "Wimbledon 2026",
      "US Open 2026",
      "National Bank Open Montreal 2026 (live feed)",
    ],
  },
  wta: {
    tour: "wta",
    ref: "nbo-tor-2026",
    provider_tournament_id: "16739",
    name: "National Bank Open Toronto 2026",
    mapFile: ".provider-map-toronto.json",
    previewFile: "tmp-toronto-rebuild-payload.json",
    prefix: "wta",
  },
};

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function lastName(full) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/);
  return parts[parts.length - 1] || "Unknown";
}

function playerMeta(m, id) {
  const p = m.player1Id === id ? m.player1 : m.player2;
  return {
    id: String(id),
    name: p?.name || `Player ${id}`,
    last_name: lastName(p?.name),
    country_code: (p?.countryAcr || "XXX").slice(0, 3).toUpperCase(),
  };
}

/**
 * Locate R16 / R32 / R64 roundIds. NBO week is a 96-draw feed: R16 has 8
 * matches (often roundId 7 once the week advances; earlier scripts assumed 6).
 * @param {any[]} singles
 */
function detectMainDrawRounds(singles) {
  /** @type {Map<number, any[]>} */
  const byRoundId = new Map();
  for (const m of singles) {
    const id = Number(m.roundId);
    if (!Number.isFinite(id)) continue;
    if (!byRoundId.has(id)) byRoundId.set(id, []);
    byRoundId.get(id).push(m);
  }

  const counts = [...byRoundId.entries()]
    .map(([id, rows]) => ({ id, n: rows.length }))
    .sort((a, b) => b.id - a.id);

  const r16 = counts.find((c) => c.n === 8);
  if (!r16) {
    throw new Error(
      `Could not find R16 (8 matches); rounds=${JSON.stringify(counts)}`
    );
  }

  const r32 = counts.find((c) => c.id === r16.id - 1 && c.n >= 14 && c.n <= 16);
  const r64 = counts.find((c) => c.id === r16.id - 2 && c.n >= 28 && c.n <= 32);
  if (!r32 || !r64) {
    throw new Error(
      `Could not pair R32/R64 under R16 roundId ${r16.id}; rounds=${JSON.stringify(counts)}`
    );
  }

  return {
    r16Id: r16.id,
    r32Id: r32.id,
    r64Id: r64.id,
    byRound: {
      4: byRoundId.get(r64.id) ?? [],
      5: byRoundId.get(r32.id) ?? [],
      6: byRoundId.get(r16.id) ?? [],
    },
  };
}

/**
 * Reconstruct 64 seats + provider maps from R16, walking back through R32 / R64.
 * Seeds without an R64 win get a bye seat.
 * @param {any[]} singles
 * @param {string} prefix tour prefix for player_ref (atp|wta)
 */
function rebuildFromResults(singles, prefix) {
  const detected = detectMainDrawRounds(singles);
  const byRound = detected.byRound;

  const r16 = [...byRound[6]].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
  if (r16.length !== 8) {
    throw new Error(
      `Expected 8 R16 matches (roundId ${detected.r16Id}), got ${r16.length}`
    );
  }
  console.log(
    `round map R64=${detected.r64Id}(${byRound[4].length}) R32=${detected.r32Id}(${byRound[5].length}) R16=${detected.r16Id}(${r16.length})`
  );

  /** @type {Array<{position:number,player_ref:string,last_name:string,seed:number|null,country_code:string,is_bye:boolean,provider_player_id:string|null}>} */
  const seats = Array.from({ length: DRAW_SIZE }, (_, position) => ({
    position,
    player_ref: `bye-${position}`,
    last_name: "Bye",
    seed: null,
    country_code: "XXX",
    is_bye: true,
    provider_player_id: null,
  }));

  /** @type {Record<string,string>} */
  const players = {};
  /** @type {Record<string,string>} */
  const matches = {};
  /** @type {Array<{match_key:string,winner_ref:string|null,voided?:boolean,_winnerId?:string}>} */
  const results = [];

  function placePlayer(position, meta) {
    const ref = `${prefix}-${meta.id}`;
    seats[position] = {
      position,
      player_ref: ref,
      last_name: meta.last_name,
      seed: null,
      country_code: meta.country_code,
      is_bye: false,
      provider_player_id: meta.id,
    };
    players[meta.id] = ref;
    return ref;
  }

  function findWin(roundMatches, playerId) {
    const id = Number(playerId);
    return roundMatches.find((m) => Number(m.match_winner) === id) || null;
  }

  function expandR32(r32Match, r32Index, r16PlayerId) {
    const seatBase = r32Index * 4;
    const r0a = `r0-m${r32Index * 2}`;
    const r0b = `r0-m${r32Index * 2 + 1}`;
    const r1Key = `r1-m${r32Index}`;

    let sideA;
    let sideB;
    if (r32Match) {
      sideA = Number(r32Match.player1Id);
      sideB = Number(r32Match.player2Id);
      matches[String(r32Match.id)] = r1Key;
      if (r32Match.match_winner != null) {
        const w = String(r32Match.match_winner);
        const wRef = players[w] || `${prefix}-${w}`;
        results.push({
          match_key: r1Key,
          winner_ref: wRef,
          voided: false,
          _winnerId: w,
        });
      }
    } else {
      sideA = Number(r16PlayerId);
      sideB = null;
      results.push({
        match_key: r1Key,
        winner_ref: `${prefix}-${r16PlayerId}`,
        voided: false,
        _winnerId: String(r16PlayerId),
      });
    }

    const sides = [sideA, sideB];
    for (let s = 0; s < 2; s++) {
      const pid = sides[s];
      const r0Key = s === 0 ? r0a : r0b;
      const pos0 = seatBase + s * 2;

      if (pid == null) {
        results.push({
          match_key: r0Key,
          winner_ref: null,
          voided: true,
        });
        continue;
      }

      const r64 = findWin(byRound[4], pid);
      if (r64) {
        const a = playerMeta(r64, r64.player1Id);
        const b = playerMeta(r64, r64.player2Id);
        const refA = placePlayer(pos0, a);
        const refB = placePlayer(pos0 + 1, b);
        matches[String(r64.id)] = r0Key;
        if (r64.match_winner != null) {
          const w = String(r64.match_winner);
          results.push({
            match_key: r0Key,
            winner_ref: w === a.id ? refA : refB,
            voided: false,
            _winnerId: w,
          });
        }
      } else {
        const src =
          r32Match && Number(r32Match.player1Id) === pid
            ? playerMeta(r32Match, pid)
            : r32Match && Number(r32Match.player2Id) === pid
              ? playerMeta(r32Match, pid)
              : {
                  id: String(pid),
                  name: `Player ${pid}`,
                  last_name: `Player${pid}`,
                  country_code: "XXX",
                };
        const r16row = r16.find(
          (m) =>
            Number(m.player1Id) === pid || Number(m.player2Id) === pid
        );
        const meta = r16row ? playerMeta(r16row, pid) : src;
        const ref = placePlayer(pos0, meta);
        results.push({
          match_key: r0Key,
          winner_ref: ref,
          voided: false,
          _winnerId: meta.id,
        });
      }
    }
  }

  for (let j = 0; j < r16.length; j++) {
    const m = r16[j];
    const r2Key = `r2-m${j}`;
    matches[String(m.id)] = r2Key;

    const p1 = Number(m.player1Id);
    const p2 = Number(m.player2Id);

    players[String(p1)] = players[String(p1)] || `${prefix}-${p1}`;
    players[String(p2)] = players[String(p2)] || `${prefix}-${p2}`;

    if (m.match_winner != null) {
      const w = String(m.match_winner);
      results.push({
        match_key: r2Key,
        winner_ref: `${prefix}-${w}`,
        voided: false,
        _winnerId: w,
      });
    }

    const r32For = (pid) => findWin(byRound[5], pid);
    expandR32(r32For(p1), j * 2, p1);
    expandR32(r32For(p2), j * 2 + 1, p2);
  }

  for (const r of results) {
    if (r._winnerId) {
      r.winner_ref = players[r._winnerId] || `${prefix}-${r._winnerId}`;
      delete r._winnerId;
    }
  }

  const real = seats.filter((s) => !s.is_bye);
  if (real.length < 16) {
    throw new Error(`Too few real seats (${real.length}); reconstruction failed`);
  }
  const refs = new Set(seats.map((s) => s.player_ref));
  if (refs.size !== seats.length) {
    throw new Error("Duplicate player_ref in seats");
  }

  const byeCount = seats.filter((s) => s.is_bye).length;
  if (seats.length !== DRAW_SIZE) {
    throw new Error(`Expected ${DRAW_SIZE} seats, got ${seats.length}`);
  }

  const verified = real.filter((s) => s.provider_player_id);
  if (verified.length < 16) {
    throw new Error(
      `Too few provider-mapped seats (${verified.length}); fail closed`
    );
  }

  return {
    seats,
    players,
    matches,
    results,
    stats: {
      r16: r16.length,
      realPlayers: real.length,
      byes: byeCount,
      mappedMatches: Object.keys(matches).length,
      resultRows: results.length,
      verifiedPlayers: verified.length,
    },
  };
}

function parseTours(argv) {
  const idx = argv.indexOf("--tour");
  if (idx >= 0) {
    const v = String(argv[idx + 1] || "").toLowerCase();
    if (v !== "atp" && v !== "wta") {
      console.error("--tour must be atp or wta");
      process.exit(1);
    }
    return [v];
  }
  return ["atp", "wta"];
}

/**
 * @param {ReturnType<typeof createClient>} client
 * @param {typeof TOURS.atp} cfg
 * @param {Record<string,string>} env
 * @param {boolean} dryRun
 */
async function importTour(client, cfg, env, dryRun) {
  console.log(
    `\n=== ${cfg.tour.toUpperCase()} ${cfg.name} (provider ${cfg.provider_tournament_id}) ===`
  );
  const { singles } = await getTournamentResults(
    client,
    cfg.tour,
    cfg.provider_tournament_id
  );
  console.log("singles rows", singles.length);

  const rebuilt = rebuildFromResults(singles, cfg.prefix);
  console.log("rebuild stats", rebuilt.stats);

  const payload = {
    tournament_ref: cfg.ref,
    tournament_patch: {
      name: cfg.name,
      draw_size: DRAW_SIZE,
      provider_tournament_id: cfg.provider_tournament_id,
      tour: cfg.tour,
      surface: "hard",
      starts_on: "2026-08-03",
      lock_at: "2026-08-02T15:00:00+00",
    },
    delete_tournament_refs: cfg.delete_tournament_refs ?? [],
    montreal_name_labels: cfg.montreal_name_labels ?? [],
    seats: rebuilt.seats,
    results: rebuilt.results,
  };

  const previewPath = resolve(process.cwd(), cfg.previewFile);
  writeFileSync(previewPath, JSON.stringify(payload, null, 2) + "\n");
  console.log("wrote", previewPath);

  /** @type {string|null} */
  let tournamentId = null;

  if (dryRun) {
    console.log("DRY RUN — skipped rebuild-draw POST");
    console.log(
      "sample seats",
      rebuilt.seats.filter((s) => !s.is_bye).slice(0, 8)
    );
  } else {
    const ingestUrl = env.MATCHREAD_INGEST_URL;
    const secret = env.INGEST_SECRET;
    if (!ingestUrl || !secret) {
      console.error("Need MATCHREAD_INGEST_URL and INGEST_SECRET for live write");
      process.exit(1);
    }
    const rebuildUrl = ingestUrl.replace(/\/ingest-events\/?$/, "/rebuild-draw");

    console.log("POST", rebuildUrl);
    const res = await fetch(rebuildUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log("status", res.status);
    console.log(text.slice(0, 2000));
    if (!res.ok) process.exit(1);
    try {
      const body = JSON.parse(text);
      if (body.tournament_id) tournamentId = String(body.tournament_id);
    } catch {
      /* ignore */
    }
    console.log(`OK — ${cfg.tour.toUpperCase()} 64-draw applied`);
  }

  const map = {
    tournament_ref: cfg.ref,
    ...(tournamentId ? { tournament_id: tournamentId } : {}),
    provider_tournament_id: cfg.provider_tournament_id,
    tour: cfg.tour,
    comment: `${cfg.name} 64-draw reconstructed from RapidAPI results (R16←R32←R64 + seed byes).`,
    players: rebuilt.players,
    matches: rebuilt.matches,
  };

  const mapPath = resolve(process.cwd(), cfg.mapFile);
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
  console.log("wrote", mapPath);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const tours = parseTours(process.argv);
  const env = {
    ...loadEnvFile(resolve(process.cwd(), ".env.provider")),
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

  for (const tour of tours) {
    await importTour(client, TOURS[tour], env, dryRun);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
