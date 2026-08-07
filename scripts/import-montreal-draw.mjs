#!/usr/bin/env node
/**
 * Rebuild Montreal (uso-2026) as a 64-draw from RapidAPI results.
 *
 * Usage (repo root):
 *   node scripts/import-montreal-draw.mjs --dry-run
 *   node scripts/import-montreal-draw.mjs
 *
 * Env (.env.provider):
 *   RAPIDAPI_KEY, RAPIDAPI_HOST
 *   MATCHREAD_INGEST_URL (base …/functions/v1/ingest-events)
 *   INGEST_SECRET
 *
 * Writes .provider-map.json (gitignored). DB writes go through Edge Function
 * rebuild-draw (service role on Supabase — no local SERVICE_ROLE key needed).
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createClient,
  getTournamentResults,
} from "@matchread/provider-rapidapi";

const TOURNAMENT_ID = "a98e387e-43c0-4fe0-9462-9e7d4a0435a1";
const PROVIDER_TOURNAMENT_ID = "21346";
const DRAW_SIZE = 64;
const R16_ROUND_ID = 6;
const R32_ROUND_ID = 5;
const R64_ROUND_ID = 4;

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
 * Reconstruct 64 seats + provider maps from completed R16 (roundId 6),
 * walking back through R32 / R64. Seeds without an R64 win get a bye seat.
 */
function rebuildFromResults(singles) {
  const byRound = {
    4: singles.filter((m) => Number(m.roundId) === R64_ROUND_ID),
    5: singles.filter((m) => Number(m.roundId) === R32_ROUND_ID),
    6: singles.filter((m) => Number(m.roundId) === R16_ROUND_ID),
  };

  const r16 = [...byRound[6]].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (r16.length !== 8) {
    throw new Error(`Expected 8 R16 matches (roundId 6), got ${r16.length}`);
  }

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
  /** @type {Array<{match_key:string,winner_ref:string|null,voided?:boolean}>} */
  const results = [];

  function placePlayer(position, meta) {
    const ref = `atp-${meta.id}`;
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

  /**
   * Expand one R32 match into four R64 seats starting at seatBase.
   * Match index in R32 column = r32Index → seats 4*r32Index .. +3
   * and r0 matches 2*r32Index, 2*r32Index+1.
   */
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
        const wRef = players[w] || `atp-${w}`;
        // winner_ref filled after seats placed
        results.push({
          match_key: r1Key,
          winner_ref: wRef,
          voided: false,
          _winnerId: w,
        });
      }
    } else {
      // Synthetic: R16 player advanced without a recorded R32 (e.g. missing row).
      sideA = Number(r16PlayerId);
      sideB = null;
      results.push({
        match_key: r1Key,
        winner_ref: `atp-${r16PlayerId}`,
        voided: false,
        _winnerId: String(r16PlayerId),
      });
    }

    const sides = [sideA, sideB];
    for (let s = 0; s < 2; s++) {
      const pid = sides[s];
      const r0Key = s === 0 ? r0a : r0b;
      const pos0 = seatBase + s * 2;
      const pos1 = seatBase + s * 2 + 1;

      if (pid == null) {
        // empty side → two byes (should not happen often)
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
        const refB = placePlayer(pos1, b);
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
        // Seed / bye into R32: player occupies top seat, bye below.
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
        // Prefer R16 row meta when available
        const r16row = r16.find(
          (m) =>
            Number(m.player1Id) === pid || Number(m.player2Id) === pid
        );
        const meta = r16row ? playerMeta(r16row, pid) : src;
        const ref = placePlayer(pos0, meta);
        // bye at pos1 already set
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

    // Ensure R16 players exist in players map (may already from R64 expand)
    players[String(p1)] = players[String(p1)] || `atp-${p1}`;
    players[String(p2)] = players[String(p2)] || `atp-${p2}`;

    if (m.match_winner != null) {
      const w = String(m.match_winner);
      results.push({
        match_key: r2Key,
        winner_ref: `atp-${w}`,
        voided: false,
        _winnerId: w,
      });
    }

    const r32For = (pid) => findWin(byRound[5], pid);
    expandR32(r32For(p1), j * 2, p1);
    expandR32(r32For(p2), j * 2 + 1, p2);
  }

  // Resolve winner_refs that were placeholders before seats existed.
  for (const r of results) {
    if (r._winnerId) {
      r.winner_ref = players[r._winnerId] || `atp-${r._winnerId}`;
      delete r._winnerId;
    }
  }

  // Fail closed: every non-bye seat must be unique and filled for real players.
  const real = seats.filter((s) => !s.is_bye);
  if (real.length < 16) {
    throw new Error(`Too few real seats (${real.length}); reconstruction failed`);
  }
  const refs = new Set(seats.map((s) => s.player_ref));
  if (refs.size !== seats.length) {
    throw new Error("Duplicate player_ref in seats");
  }

  // Count expected: 8 R16 matches → 16 R32 slots → up to 16 bye advances in R64
  const byeCount = seats.filter((s) => s.is_bye).length;
  if (seats.length !== DRAW_SIZE) {
    throw new Error(`Expected ${DRAW_SIZE} seats, got ${seats.length}`);
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
    },
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
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
  console.log("Fetching RapidAPI tournament results", PROVIDER_TOURNAMENT_ID);
  const { singles } = await getTournamentResults(
    client,
    "atp",
    PROVIDER_TOURNAMENT_ID
  );
  console.log("singles rows", singles.length);

  const rebuilt = rebuildFromResults(singles);
  console.log("rebuild stats", rebuilt.stats);

  const map = {
    tournament_id: TOURNAMENT_ID,
    provider_tournament_id: PROVIDER_TOURNAMENT_ID,
    tour: "atp",
    comment:
      "Montreal Masters 2026 full 64-draw reconstructed from RapidAPI results (R16←R32←R64 + seed byes).",
    players: rebuilt.players,
    matches: rebuilt.matches,
  };

  const mapPath = resolve(process.cwd(), ".provider-map.json");
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
  console.log("wrote", mapPath);

  const payload = {
    tournament_id: TOURNAMENT_ID,
    tournament_patch: {
      name: "National Bank Open Montreal 2026",
      draw_size: DRAW_SIZE,
      provider_tournament_id: PROVIDER_TOURNAMENT_ID,
      surface: "hard",
      starts_on: "2026-08-03",
      lock_at: "2026-08-02T15:00:00+00",
    },
    delete_tournament_refs: ["rg-2026", "wim-2026"],
    montreal_name_labels: [
      "Roland Garros 2026",
      "Wimbledon 2026",
      "US Open 2026",
      "National Bank Open Montreal 2026 (live feed)",
    ],
    seats: rebuilt.seats,
    results: rebuilt.results,
  };

  const previewPath = resolve(process.cwd(), "tmp-montreal-rebuild-payload.json");
  writeFileSync(previewPath, JSON.stringify(payload, null, 2) + "\n");
  console.log("wrote", previewPath);

  if (dryRun) {
    console.log("DRY RUN — skipped rebuild-draw POST");
    console.log(
      "sample seats",
      rebuilt.seats.filter((s) => !s.is_bye).slice(0, 8)
    );
    return;
  }

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
  console.log("OK — Montreal 64-draw applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
