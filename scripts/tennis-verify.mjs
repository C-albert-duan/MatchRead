/**
 * pnpm tennis:verify --slug t-atp-XXXX
 * Runs evaluateDrawIntegrity against DB seats (+ optional live provider probe).
 */
import { createClient } from "@supabase/supabase-js";
import {
  createClient as createRapid,
  evaluateDrawIntegrity,
  resolveOfficialSeats,
} from "@matchread/provider-rapidapi";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const slug = arg("--slug") || arg("-s");
if (!slug) {
  console.error("Usage: node scripts/tennis-verify.mjs --slug t-atp-…");
  process.exit(2);
}

const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!url || !key) {
  console.error("Need SUPABASE_URL and a Supabase key in env");
  process.exit(2);
}

const admin = createClient(url, key);
const { data: t, error } = await admin
  .from("tournaments")
  .select(
    "id, slug, name, tour, provider_id, surface, tier, bracket_eligible, draw_checked_at, published_at, draw_size"
  )
  .eq("slug", slug)
  .maybeSingle();

if (error || !t) {
  console.error("tournament not found:", error?.message || slug);
  process.exit(1);
}

const { data: seats } = await admin
  .from("seats")
  .select(
    "position, kind, seed, entry, tbd_label, player_id, players(provider_id, last_name, display_name, country_code)"
  )
  .eq("tournament_id", t.id)
  .order("position");

const mapped = (seats ?? []).map((s) => {
  const pl = Array.isArray(s.players) ? s.players[0] : s.players;
  return {
    position: s.position,
    kind: s.kind,
    seat_kind: s.kind,
    seed: s.seed,
    entry_status: s.entry,
    tbd_label: s.tbd_label,
    provider_player_id: pl?.provider_id ?? null,
    last_name: pl?.last_name ?? null,
    display_name: pl?.display_name || pl?.last_name,
    country_code: pl?.country_code,
  };
});

const report = evaluateDrawIntegrity({
  seats: mapped,
  tournament: {
    tour: t.tour,
    provider_id: t.provider_id,
    surface: t.surface,
    bracket_eligible: t.bracket_eligible,
    draw_checked_at: t.draw_checked_at,
  },
  drawTour: t.tour,
  drawProviderId: t.provider_id,
  source: "official",
});

console.log(`[${report.safeToPublish ? "PASS" : "FAIL"}] integrity ${slug}`);
console.log("  tour", t.tour, "tier", t.tier, "eligible", t.bracket_eligible);
console.log("  seats", mapped.length, "draw_size", t.draw_size);
console.log("  published_at", t.published_at);
for (const e of report.blockingErrors) {
  console.log("  [BLOCK]", e.code, e.message);
}
for (const w of report.warnings) {
  console.log("  [WARN]", w.code, w.message);
}

const rapidKey = process.env.RAPIDAPI_KEY?.trim();
if (rapidKey && t.provider_id) {
  const rapid = createRapid({
    key: rapidKey,
    host:
      process.env.RAPIDAPI_HOST?.trim() ||
      "tennis-api-atp-wta-itf.p.rapidapi.com",
  });
  const official = await resolveOfficialSeats(rapid, {
    tour: t.tour,
    name: t.name,
    provider_id: t.provider_id,
    draw_size: t.draw_size,
    starts_on: null,
  });
  console.log(
    official.ok
      ? `[PASS] provider draw ${official.drawSize} seats source=${official.source || "official"}`
      : `[WARN] provider draw: ${official.reason}`
  );
} else {
  console.log("[WARN] live provider probe skipped (set RAPIDAPI_KEY)");
}

console.log(
  `\nRESULT: SAFE_TO_PUBLISH=${report.safeToPublish ? "true" : "false"}`
);
process.exit(report.safeToPublish ? 0 : 1);
