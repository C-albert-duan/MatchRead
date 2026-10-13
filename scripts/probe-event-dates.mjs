#!/usr/bin/env node
/**
 * Read-only calendar date probe: provider week dates vs stored
 * starts_on / main_draw_starts_on. No named-event filter.
 *
 * Usage (repo root):
 *   node scripts/probe-event-dates.mjs
 *   node scripts/probe-event-dates.mjs --json
 *
 * Loads RAPIDAPI_* from .env.provider and optional SUPABASE_* from .env.local.
 * Never writes to the database.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createRapid, getDualTourCalendar } from "@matchread/provider-rapidapi";

function loadEnvFile(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnvFile(".env.local"), ...loadEnvFile(".env.provider") };
const key = env.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
const host =
  env.RAPIDAPI_HOST ||
  process.env.RAPIDAPI_HOST ||
  "tennis-api-atp-wta-itf.p.rapidapi.com";

if (!key || key.startsWith("<")) {
  console.error("RAPIDAPI_KEY missing in .env.provider");
  process.exit(1);
}

function pickDateFields(row, tour) {
  return {
    tour,
    id: row?.id != null ? String(row.id) : null,
    type: row?.type || row?.category || row?.tier || null,
    startDate:
      row?.startDate ||
      row?.start ||
      row?.dateStart ||
      row?.start_date ||
      row?.date ||
      null,
    endDate:
      row?.endDate || row?.end || row?.dateEnd || row?.end_date || null,
  };
}

async function loadStoredTournaments() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const service =
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !service) {
    return { ok: false, reason: "no supabase service env", rows: [] };
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("tournaments")
    .select(
      "id, slug, tour, provider_id, starts_on, main_draw_starts_on, ends_on, lock_at, venue_tz, tier, bracket_eligible, published_at"
    )
    .eq("bracket_eligible", true)
    .order("starts_on", { ascending: true })
    .limit(80);
  if (error) return { ok: false, reason: error.message, rows: [] };
  return { ok: true, rows: data ?? [] };
}

const year = new Date().getUTCFullYear();
const rapid = createRapid({ key, host });
const dual = await getDualTourCalendar(rapid, year, {
  since: `${year}-07-01`,
  pageSize: 500,
  pageNo: 1,
});

const providerHits = [
  ...(dual.atp?.tournaments ?? []).map((t) => pickDateFields(t, "atp")),
  ...(dual.wta?.tournaments ?? []).map((t) => pickDateFields(t, "wta")),
];

const stored = await loadStoredTournaments();

const report = {
  generated_at: new Date().toISOString(),
  provider_date_fields: providerHits,
  stored_tournaments: stored,
  interpretation: {
    date_semantics:
      "Compare provider startDate/endDate to stored starts_on / main_draw_starts_on. Product readers must use main_draw_starts_on, not the week banner.",
  },
};

const outPath = resolve(
  process.cwd(),
  "discussion/0821 Updates/probe-event-dates-diagnosis.json"
);
writeFileSync(outPath, JSON.stringify(report, null, 2));

const mdPath = resolve(
  process.cwd(),
  "discussion/0821 Updates/probe-event-dates-diagnosis.md"
);
const md = `# Event-date probe

Generated: ${report.generated_at}

Read-only probe (\`scripts/probe-event-dates.mjs\`). No database writes. Rows identified by provider id / slug.

## Provider date fields

| Tour | Provider id | startDate | endDate |
|------|-------------|-----------|---------|
${providerHits
  .map(
    (h) =>
      `| ${h.tour} | ${h.id} | ${h.startDate} | ${h.endDate} |`
  )
  .join("\n")}

## Stored rows

${
  stored.ok
    ? stored.rows
        .map(
          (r) =>
            `- **${r.tour}** \`${r.slug}\`: starts_on=${r.starts_on}, main_draw_starts_on=${r.main_draw_starts_on}, ends_on=${r.ends_on}, lock_at=${r.lock_at}`
        )
        .join("\n")
    : `Unavailable: ${stored.reason}`
}

## What this means

- Date fields: product readers must use \`main_draw_starts_on\`, not ambiguous \`starts_on\`.
- Do not special-case a title; every eligible slug uses the same columns.
`;

writeFileSync(mdPath, md);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Provider hits: ${providerHits.length}`);
  console.log(`Stored rows: ${stored.ok ? stored.rows.length : stored.reason}`);
}
