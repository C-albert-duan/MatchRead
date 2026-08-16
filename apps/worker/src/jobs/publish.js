import {
  createClient,
  getTournamentFixtures,
  getTournamentResults,
  namedFirstRoundPairs,
  overlayOfficialDraw,
  resolveOfficialSeats,
} from "@matchread/provider-rapidapi";
import { rebuildUrl, supabaseRest } from "../env.js";
import { postJson, restGet } from "../rest.js";
import { SEASON } from "../season.js";

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

async function listEvents(env) {
  const byRef = new Map(SEASON.map((row) => [row.ref, { ...row }]));
  const sb = supabaseRest(env);
  if (sb) {
    try {
      const rows = await restGet(
        sb,
        "tournaments?select=id,ref,name,tour,draw_size,provider_tournament_id&provider_tournament_id=not.is.null"
      );
      for (const row of rows) {
        if (!row?.ref || !row.provider_tournament_id) continue;
        byRef.set(row.ref, {
          id: row.id,
          ref: row.ref,
          name: row.name,
          api_name: byRef.get(row.ref)?.api_name,
          tour: row.tour === "wta" ? "wta" : "atp",
          provider_tournament_id: String(row.provider_tournament_id),
          draw_size: byRef.get(row.ref)?.draw_size || Number(row.draw_size) || 64,
        });
      }
    } catch (err) {
      console.warn("publish: tournament list failed:", err.message || err);
    }
  }
  return [...byRef.values()];
}

/**
 * Pull Tennis API fixtures and POST official seats / announced pairs to rebuild-draw.
 * Does not write the database itself.
 */
export async function publishDraws(env, { dryRun = false } = {}) {
  const client = createClient({
    key: env.RAPIDAPI_KEY,
    host: env.RAPIDAPI_HOST,
  });
  const events = await listEvents(env);
  const summary = { announced: 0, published: 0, pending: 0, skipped: 0, errors: 0 };
  const url = rebuildUrl(env);

  for (const event of events) {
    const label = `${event.ref} (${event.tour} ${event.provider_tournament_id})`;
    try {
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
      } catch {
        results = [];
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
        console.log("publish", label, `announced ${matchups.length}`);
        if (!dryRun) await postJson(url, env.INGEST_SECRET, payload);
        summary.announced += 1;
      }

      const official = await resolveOfficialSeats(client, event, fixtures);
      if (!official.ok) {
        console.log(
          "publish",
          label,
          "pending —",
          official.reason,
          official.firstRound || ""
        );
        summary.pending += 1;
        continue;
      }

      const built = overlayOfficialDraw(official.seats, fixtures, {
        prefix: event.tour,
        results,
      });

      if (!built.ok) {
        console.log("publish", label, "pending —", built.reason);
        summary.pending += 1;
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
      };
      console.log("publish", label, `complete ${built.drawSize}-draw`);
      if (!dryRun) await postJson(url, env.INGEST_SECRET, payload);
      summary.published += 1;
    } catch (err) {
      summary.errors += 1;
      console.error("publish", label, err.message || err);
    }
  }

  return summary;
}
