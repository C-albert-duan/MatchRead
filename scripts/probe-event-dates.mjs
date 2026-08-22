#!/usr/bin/env node
/**
 * Sprint Directive §3.2 / §2.2 — read-only date + Cincinnati fixture probe.
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

const TARGETS = [
  { label: "Cincinnati", nameRe: /cincinnati|national bank open/i },
  { label: "Winston-Salem", nameRe: /winston/i },
  { label: "US Open", nameRe: /us open|u\.s\. open/i },
  { label: "Monterrey", nameRe: /monterrey/i },
];

const CINCY_ATP = { name: "Fonseca", vs: "O'Connell", roundHint: "R32" };
const CINCY_WTA = { name: "Wang", vs: "Svitolina", roundHint: "R32" };

function pickDateFields(row) {
  const keys = row && typeof row === "object" ? Object.keys(row) : [];
  return {
    id: row?.id != null ? String(row.id) : null,
    name: row?.name || row?.tournamentName || null,
    type: row?.type || row?.category || row?.tier || null,
    surface: row?.surface || null,
    startDate:
      row?.startDate ||
      row?.start ||
      row?.dateStart ||
      row?.start_date ||
      row?.date ||
      null,
    endDate:
      row?.endDate || row?.end || row?.dateEnd || row?.end_date || null,
    city: row?.city || row?.location || null,
    country: row?.country || null,
    raw_keys: keys,
  };
}

function findTargets(list) {
  const found = [];
  for (const t of TARGETS) {
    const hits = list.filter((r) => {
      const name = String(r.name || "");
      if (t.label === "Cincinnati") {
        return /cincinnati/i.test(name);
      }
      if (t.label === "US Open") {
        return /u\.?s\.?\s*open/i.test(name) && !/junior/i.test(name);
      }
      return t.nameRe.test(name);
    });
    for (const hit of hits) {
      found.push({ label: t.label, tour: hit._tour, ...pickDateFields(hit) });
    }
  }
  return found;
}

async function fetchTournamentFixtures(tour, tournamentId) {
  // Same path as packages/provider-rapidapi getTournamentResults
  const url = `https://${host}/tennis/v2/${tour}/tournament/results/${tournamentId}`;
  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, url };
}

function flattenSingles(payload) {
  const root = payload?.data ?? payload ?? {};
  const singles = root.singles ?? root.results ?? root.matches ?? [];
  return Array.isArray(singles) ? singles : [];
}

function rowNameBlob(r) {
  const parts = [
    r.player1Name,
    r.player2Name,
    r.player1?.name,
    r.player2?.name,
    r.player1?.lastName,
    r.player2?.lastName,
    r.player1LastName,
    r.player2LastName,
    r.home?.name,
    r.away?.name,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function diagnoseMatch(rows, a, b) {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const hits = rows.filter((r) => {
    const blob = rowNameBlob(r);
    return blob.includes(aLower) && blob.includes(bLower);
  });
  const sample = rows.slice(0, 3).map((r) => ({
    id: r.id,
    keys: Object.keys(r || {}),
    blob: rowNameBlob(r).slice(0, 120),
    match_winner: r.match_winner ?? null,
  }));
  if (hits.length === 0) {
    return {
      shape: "missing_from_provider_or_name_mismatch",
      provider_rows: 0,
      detail: `No provider result naming both ${a} and ${b}`,
      sample,
    };
  }
  const row = hits[0];
  const hasWinner =
    row.match_winner != null &&
    String(row.match_winner).trim() !== "" &&
    String(row.match_winner) !== "0";
  const hasTime = Boolean(row.startDate || row.startTime || row.date || row.scheduled);
  return {
    shape: hasWinner
      ? "provider_has_winner"
      : hasTime
        ? "timestamp_no_winner"
        : "no_timestamp_no_winner",
    provider_rows: hits.length,
    provider_match_id: row.id != null ? String(row.id) : null,
    match_winner: row.match_winner ?? null,
    start: row.startDate || row.startTime || row.date || null,
    roundId: row.roundId ?? null,
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
      "id, slug, name, tour, provider_id, starts_on, ends_on, lock_at, venue_tz, tier, bracket_eligible, published_at"
    )
    .or(
      "name.ilike.%cincinnati%,name.ilike.%winston%,name.ilike.%us open%,name.ilike.%monterrey%,slug.ilike.%cincinnati%,slug.ilike.%winston%,slug.ilike.%us-open%,slug.ilike.%uso%"
    );
  if (error) return { ok: false, reason: error.message, rows: [] };
  return { ok: true, rows: data ?? [] };
}

async function diagnoseStoredMatch(sb, tournamentId, lastA, lastB) {
  const { data: players } = await sb
    .from("players")
    .select("id, last_name, provider_id")
    .or(`last_name.ilike.%${lastA}%,last_name.ilike.%${lastB}%`);
  const ids = (players ?? []).map((p) => p.id);
  if (ids.length === 0) {
    return { shape: "no_players_in_db", match: null };
  }
  const { data: matches } = await sb
    .from("matches")
    .select(
      "id, round, index_in_round, provider_match_id, winner_player_id, voided, scheduled_at, has_time, side_a_player_id, side_b_player_id"
    )
    .eq("tournament_id", tournamentId)
    .or(
      `side_a_player_id.in.(${ids.join(",")}),side_b_player_id.in.(${ids.join(",")})`
    );
  const pair = (matches ?? []).filter((m) => {
    const sides = [m.side_a_player_id, m.side_b_player_id];
    const aOk = (players ?? []).some(
      (p) =>
        p.last_name?.toLowerCase().includes(lastA.toLowerCase()) &&
        sides.includes(p.id)
    );
    const bOk = (players ?? []).some(
      (p) =>
        p.last_name?.toLowerCase().includes(lastB.toLowerCase()) &&
        sides.includes(p.id)
    );
    return aOk && bOk;
  });
  if (pair.length === 0) {
    return {
      shape: "missing_match_row",
      match: null,
      note: "Players may exist but no match row pairs both sides",
    };
  }
  const m = pair[0];
  if (!m.winner_player_id && !m.voided) {
    return {
      shape: m.scheduled_at || m.has_time ? "null_winner_row" : "null_winner_no_time",
      match: m,
    };
  }
  return { shape: "settled", match: m };
}

const year = new Date().getUTCFullYear();
const rapid = createRapid({ key, host });
const dual = await getDualTourCalendar(rapid, year, {
  since: `${year}-07-01`,
  pageSize: 500,
  pageNo: 1,
});

const atp = (dual.atp?.tournaments ?? []).map((t) => ({ ...t, _tour: "atp" }));
const wta = (dual.wta?.tournaments ?? []).map((t) => ({ ...t, _tour: "wta" }));
const providerHits = findTargets([...atp, ...wta]);

const stored = await loadStoredTournaments();

const cincyAtp = providerHits.find(
  (h) => h.label === "Cincinnati" && h.tour === "atp"
);
const cincyWta = providerHits.find(
  (h) => h.label === "Cincinnati" && h.tour === "wta"
);

const fixtureDiag = {};
if (cincyAtp?.id) {
  const { status, json } = await fetchTournamentFixtures("atp", cincyAtp.id);
  const rows = flattenSingles(json);
  fixtureDiag.atp_fonseca_oconnell = {
    http: status,
    provider_singles: rows.length,
    ...diagnoseMatch(rows, CINCY_ATP.name, "Connell"),
  };
}
if (cincyWta?.id) {
  const { status, json } = await fetchTournamentFixtures("wta", cincyWta.id);
  const rows = flattenSingles(json);
  fixtureDiag.wta_wang_svitolina = {
    http: status,
    provider_singles: rows.length,
    ...diagnoseMatch(rows, CINCY_WTA.name, CINCY_WTA.vs),
  };
}

let storedMatchDiag = {};
if (stored.ok) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  for (const row of stored.rows) {
    if (!/cincinnati/i.test(row.name || "") && !/cincinnati/i.test(row.slug || "")) {
      continue;
    }
    const keyTour = `${row.tour}:${row.slug}`;
    if (row.tour === "atp") {
      storedMatchDiag[keyTour + ":fonseca"] = await diagnoseStoredMatch(
        sb,
        row.id,
        "Fonseca",
        "Connell"
      );
    }
    if (row.tour === "wta") {
      storedMatchDiag[keyTour + ":wang"] = await diagnoseStoredMatch(
        sb,
        row.id,
        "Wang",
        "Svitolina"
      );
    }
  }
}

const report = {
  generated_at: new Date().toISOString(),
  directive: "MatchRead Sprint Directive 2.1 §2.2 / §3.2",
  provider_date_fields: providerHits,
  stored_tournaments: stored,
  cincinnati_fixture_diagnosis: fixtureDiag,
  cincinnati_stored_match_diagnosis: storedMatchDiag,
  interpretation: {
    date_semantics:
      "Compare provider startDate/endDate to stored starts_on/ends_on/lock_at. Opposite-direction errors imply starts_on is not main_draw_starts_on.",
    atp_branch:
      "null_winner_row → stored-row diff finds it. timestamp_no_winner on provider → result never applied.",
    wta_branch:
      "missing_match_row → provider-first upsert required; stored-first sweep cannot heal.",
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
const md = `# Event-date + Cincinnati fixture diagnosis

Generated: ${report.generated_at}

Read-only probe (\`scripts/probe-event-dates.mjs\`). No database writes.

## Provider date fields

| Label | Tour | Provider id | startDate | endDate |
|-------|------|-------------|-----------|---------|
${providerHits
  .map(
    (h) =>
      `| ${h.label} | ${h.tour} | ${h.id} | ${h.startDate} | ${h.endDate} |`
  )
  .join("\n")}

## Stored rows

${
  stored.ok
    ? stored.rows
        .map(
          (r) =>
            `- **${r.tour}** ${r.name} (\`${r.slug}\`): starts_on=${r.starts_on}, ends_on=${r.ends_on}, lock_at=${r.lock_at}, venue_tz=${r.venue_tz}`
        )
        .join("\n")
    : `Unavailable: ${stored.reason}`
}

## Cincinnati branches

### ATP Fonseca–O'Connell

\`\`\`json
${JSON.stringify(fixtureDiag.atp_fonseca_oconnell ?? {}, null, 2)}
\`\`\`

Stored: \`\`\`json
${JSON.stringify(
  Object.fromEntries(
    Object.entries(storedMatchDiag).filter(([k]) => k.includes("fonseca"))
  ),
  null,
  2
)}
\`\`\`

### WTA Wang–Svitolina

\`\`\`json
${JSON.stringify(fixtureDiag.wta_wang_svitolina ?? {}, null, 2)}
\`\`\`

Stored: \`\`\`json
${JSON.stringify(
  Object.fromEntries(
    Object.entries(storedMatchDiag).filter(([k]) => k.includes("wang"))
  ),
  null,
  2
)}
\`\`\`

## What this means for Phase 3–4

- If WTA stored shape is \`missing_match_row\`, reconciliation must iterate the **provider** set and create/bind — a stored-row diff will never find it.
- If ATP stored shape is \`null_winner_row\`, repair + \`claim_settlement\` is enough for that branch.
- Date fields: product readers must use \`main_draw_starts_on\`, not ambiguous \`starts_on\`.
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
