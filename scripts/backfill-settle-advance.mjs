/**
 * One-shot backfill: re-apply archive results with pair binding + parent advance.
 * Usage (local): node scripts/backfill-settle-advance.mjs --slug t-atp-xxxxx
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + RAPIDAPI_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import {
  bindResultsByPlayerPair,
  createClient as createRapid,
  getTournamentResults,
  mapResultsToIngest,
} from "../packages/provider-rapidapi/src/index.js";

const slug = process.argv.includes("--slug")
  ? process.argv[process.argv.indexOf("--slug") + 1]
  : null;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rapidKey = process.env.RAPIDAPI_KEY;
if (!url || !key || !rapidKey) {
  console.error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAPIDAPI_KEY");
  process.exit(1);
}

const admin = createClient(url, key);
const rapid = createRapid({ key: rapidKey });

const { data: tours, error } = await admin
  .from("tournaments")
  .select("id, slug, tour, provider_id, published_at")
  .not("published_at", "is", null)
  .not("provider_id", "is", null);
if (error) throw error;

const targets = (tours ?? []).filter((t) => !slug || t.slug === slug);
console.log(`backfill ${targets.length} tournament(s)`);

for (const event of targets) {
  const { data: matchRows } = await admin
    .from("matches")
    .select(
      "id, round, index_in_round, provider_match_id, side_a_player_id, side_b_player_id"
    )
    .eq("tournament_id", event.id);

  const playerIds = [
    ...new Set(
      (matchRows ?? [])
        .flatMap((m) => [m.side_a_player_id, m.side_b_player_id])
        .filter(Boolean)
    ),
  ];
  const { data: people } = await admin
    .from("players")
    .select("id, provider_id")
    .in("id", playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"]);
  const providerByUuid = new Map(
    (people ?? []).map((p) => [p.id, String(p.provider_id)])
  );
  const players = {};
  for (const p of people ?? []) players[String(p.provider_id)] = String(p.provider_id);

  const sides = (matchRows ?? []).map((m) => ({
    match_key: `r${m.round}-m${m.index_in_round}`,
    round: m.round,
    index_in_round: m.index_in_round,
    provider_match_id: m.provider_match_id ? String(m.provider_match_id) : null,
    side_a_provider_id: m.side_a_player_id
      ? providerByUuid.get(m.side_a_player_id) ?? null
      : null,
    side_b_provider_id: m.side_b_player_id
      ? providerByUuid.get(m.side_b_player_id) ?? null
      : null,
  }));

  const { singles } = await getTournamentResults(
    rapid,
    event.tour,
    event.provider_id
  );
  const bound = bindResultsByPlayerPair(singles ?? [], sides, players);
  const matches = {};
  for (const m of matchRows ?? []) {
    if (m.provider_match_id) {
      matches[String(m.provider_match_id)] = `r${m.round}-m${m.index_in_round}`;
    }
  }
  const mapped = mapResultsToIngest(singles ?? [], {
    tournament_id: event.id,
    provider_tournament_id: event.provider_id,
    players,
    matches,
  });

  console.log(
    `${event.slug}: bound=${bound.results.length} mapped=${mapped.results.length}`
  );
  console.log(
    "  (apply via sync-facts POST or applyMatchResults in edge — this script lists only)"
  );
}
