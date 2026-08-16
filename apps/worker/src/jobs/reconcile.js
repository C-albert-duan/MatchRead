import {
  createClient,
  getLiveEvents,
  getTournamentFixtures,
  getTournamentResults,
  mapLiveFinishedToIngest,
  mapResultsToIngest,
  overlayOfficialDraw,
  resolveOfficialSeats,
} from "@matchread/provider-rapidapi";
import { rebuildUrl, settleUrl, supabaseRest } from "../env.js";
import { postJson, restGet } from "../rest.js";
import { SEASON } from "../season.js";

async function listLiveEvents(env) {
  const byRef = new Map(SEASON.map((row) => [row.ref, { ...row }]));
  const sb = supabaseRest(env);
  if (!sb) return [...byRef.values()].filter((e) => e.id);
  const rows = await restGet(
    sb,
    "tournaments?select=id,ref,name,tour,draw_size,provider_tournament_id,starts_on&provider_tournament_id=not.is.null"
  );
  for (const row of rows) {
    if (!row?.id || !row.provider_tournament_id) continue;
    byRef.set(row.ref, {
      id: row.id,
      ref: row.ref,
      name: row.name,
      api_name: byRef.get(row.ref)?.api_name,
      tour: row.tour === "wta" ? "wta" : "atp",
      provider_tournament_id: String(row.provider_tournament_id),
      draw_size: Number(row.draw_size) || 64,
      starts_on: row.starts_on ?? null,
    });
  }
  return [...byRef.values()].filter((e) => e.id);
}

async function mappingFromDb(sb, event) {
  const [draws, maps] = await Promise.all([
    restGet(sb, `draws?select=id&tournament_id=eq.${event.id}`),
    restGet(
      sb,
      `provider_match_map?select=provider_match_id,match_key&tournament_id=eq.${event.id}`
    ),
  ]);
  /** @type {Record<string, string>} */
  const players = {};
  const drawId = draws[0]?.id;
  /** @type {unknown[]} */
  let seats = [];
  if (drawId) {
    seats = await restGet(
      sb,
      `draw_seats?select=position,player_ref,last_name,seed,country_code,is_bye,seat_kind,entry_status,provider_player_id&draw_id=eq.${drawId}`
    );
    for (const s of seats) {
      if (s.provider_player_id && s.player_ref) {
        players[String(s.provider_player_id)] = s.player_ref;
      }
    }
  }
  /** @type {Record<string, string>} */
  const matches = {};
  for (const row of maps ?? []) {
    if (row.provider_match_id && row.match_key) {
      matches[String(row.provider_match_id)] = row.match_key;
    }
  }
  return { players, matches, seats };
}

async function mappingFromOfficial(client, event, fixtures, results) {
  const official = await resolveOfficialSeats(client, event, fixtures);
  if (!official.ok) return { players: {}, matches: {}, seats: [] };
  const built = overlayOfficialDraw(official.seats, fixtures, {
    prefix: event.tour,
    results,
  });
  if (!built.ok) return { players: {}, matches: {}, seats: [] };
  return {
    players: built.players,
    matches: built.matches,
    seats: built.seats,
    results: built.results,
  };
}

/**
 * Pull finished Tennis API results and POST ingest-events.
 * Mapping comes from official seats + provider_match_map (anon read).
 */
export async function reconcileResults(env, { dryRun = false } = {}) {
  const sb = supabaseRest(env);
  const client = createClient({
    key: env.RAPIDAPI_KEY,
    host: env.RAPIDAPI_HOST,
  });
  const events = sb ? await listLiveEvents(env) : [];
  const summary = {
    events: events.length,
    ingested: 0,
    skipped: 0,
    errors: 0,
    settled: 0,
  };

  if (!sb) {
    console.warn("reconcile: no Supabase URL/anon key — skip");
    return summary;
  }

  let liveEvents = [];
  try {
    const live = await getLiveEvents(client);
    liveEvents = live.events;
  } catch (err) {
    console.warn("reconcile live events:", err instanceof Error ? err.message : err);
  }

  const rebuild = rebuildUrl(env);
  const settle = settleUrl(env);

  for (const event of events) {
    const label = `${event.ref} (${event.provider_tournament_id})`;
    try {
      const fromDb = await mappingFromDb(sb, event);
      const { fixtures } = await getTournamentFixtures(
        client,
        event.tour,
        event.provider_tournament_id
      );
      const { singles } = await getTournamentResults(
        client,
        event.tour,
        event.provider_tournament_id
      );
      const fromOfficial = await mappingFromOfficial(
        client,
        event,
        fixtures,
        singles
      );
      const mapping = {
        tournament_id: event.id,
        provider_tournament_id: event.provider_tournament_id,
        tour: event.tour,
        players: { ...fromOfficial.players, ...fromDb.players },
        matches: { ...fromOfficial.matches, ...fromDb.matches },
      };
      if (Object.keys(mapping.matches).length === 0) {
        console.log("reconcile", label, "no match map yet");
        summary.skipped += 1;
        continue;
      }

      if (!dryRun && fromOfficial.matches && Object.keys(fromOfficial.matches).length) {
        await postJson(rebuild, env.INGEST_SECRET, {
          tournament_ref: event.ref,
          seats: fromOfficial.seats,
          matches: fromOfficial.matches,
          results: fromOfficial.results ?? [],
        });
      }

      const mapped = mapResultsToIngest(singles, mapping);
      const liveMapped = mapLiveFinishedToIngest(
        liveEvents.filter((row) => {
          const id = String(row?.matchId ?? "").split("-")[2];
          return id === String(event.provider_tournament_id);
        }),
        mapping
      );
      const results = [...mapped.results, ...liveMapped.results];
      console.log(
        "reconcile",
        label,
        `mapped=${mapped.results.length} live=${liveMapped.results.length} skipped=${mapped.skipped.length}`
      );
      if (!results.length) {
        summary.skipped += 1;
        continue;
      }
      if (!dryRun) {
        await postJson(env.MATCHREAD_INGEST_URL, env.INGEST_SECRET, {
          tournament_id: event.id,
          results,
        });
        // Same tick as finished facts: grade brackets once the match is done.
        if (settle) {
          await postJson(settle, env.INGEST_SECRET, {
            tournament_ref: event.ref,
          });
          summary.settled += 1;
        }
      }
      summary.ingested += results.length;
    } catch (err) {
      summary.errors += 1;
      console.error("reconcile", label, err.message || err);
    }
  }

  return summary;
}
