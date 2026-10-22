/**
 * findMatchByProviderEvent reads provider_event_map by tour and live-list id.
 * Requires the local Supabase stack (npm run test:db).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { describe, it, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { findMatchByProviderEvent } from "./live-repository.js";

const API_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SLUG = "pgtap-event-lookup";
const EVENT_ID = "evt-lookup-1";

function serviceRoleKey() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fromEnv) return fromEnv;
  const out = execSync("npx supabase status -o env", {
    encoding: "utf8",
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const line = out.split(/\r?\n/).find((row) => row.startsWith("SERVICE_ROLE_KEY="));
  const value = line?.slice("SERVICE_ROLE_KEY=".length).replace(/^"|"$/g, "") ?? "";
  if (!value) throw new Error("local service role key was not found");
  return value;
}

/** @type {import("@supabase/supabase-js").SupabaseClient} */
let admin;

async function cleanup() {
  const { data: events } = await admin.from("tournaments").select("id").eq("slug", SLUG);
  const ids = (events ?? []).map((row) => row.id);
  if (ids.length) await admin.from("tournaments").delete().in("id", ids);
  await admin.from("players").delete().in("provider_id", ["pgtap-lookup-a", "pgtap-lookup-b"]);
}

describe("findMatchByProviderEvent", () => {
  /** @type {string} */
  let atpMatch;
  /** @type {string} */
  let wtaMatch;

  before(async () => {
    admin = createClient(API_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await cleanup();
    const { data: event, error } = await admin
      .from("tournaments")
      .insert({
        slug: SLUG,
        name: "Lookup Fixture",
        tour: "atp",
        starts_on: "2026-10-09",
        ends_on: "2026-10-10",
        draw_size: 4,
        provider_id: "91002",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { data: players, error: playerErr } = await admin
      .from("players")
      .upsert(
        [
          { provider_id: "pgtap-lookup-a", last_name: "Adler" },
          { provider_id: "pgtap-lookup-b", last_name: "Berg" },
        ],
        { onConflict: "provider_id" }
      )
      .select("id, provider_id");
    if (playerErr) throw new Error(playerErr.message);
    const sideA = players.find((row) => row.provider_id === "pgtap-lookup-a").id;
    const sideB = players.find((row) => row.provider_id === "pgtap-lookup-b").id;
    const { data: matches, error: matchErr } = await admin
      .from("matches")
      .insert([
        {
          tournament_id: event.id,
          round: 0,
          index_in_round: 0,
          side_a_player_id: sideA,
          side_b_player_id: sideB,
        },
        {
          tournament_id: event.id,
          round: 0,
          index_in_round: 1,
          side_a_player_id: sideA,
          side_b_player_id: sideB,
        },
      ])
      .select("id, index_in_round");
    if (matchErr) throw new Error(matchErr.message);
    atpMatch = matches.find((row) => row.index_in_round === 0).id;
    wtaMatch = matches.find((row) => row.index_in_round === 1).id;
    const { error: mapErr } = await admin.from("provider_event_map").insert([
      { tour: "atp", provider_event_id: EVENT_ID, match_id: atpMatch },
      { tour: "wta", provider_event_id: EVENT_ID, match_id: wtaMatch },
    ]);
    if (mapErr) throw new Error(mapErr.message);
  });

  after(async () => {
    if (admin) await cleanup();
  });

  it("returns the same match for one tour and no match for an unknown id", async () => {
    const first = await findMatchByProviderEvent(admin, "atp", EVENT_ID);
    const second = await findMatchByProviderEvent(admin, "atp", EVENT_ID);
    assert.equal(first, atpMatch);
    assert.equal(second, atpMatch);
    assert.equal(await findMatchByProviderEvent(admin, "wta", EVENT_ID), wtaMatch);
    assert.equal(await findMatchByProviderEvent(admin, "atp", "evt-missing"), null);
    assert.equal(await findMatchByProviderEvent(admin, "wta", "evt-missing"), null);
    assert.equal(await findMatchByProviderEvent(admin, "atp", "  "), null);
  });
});