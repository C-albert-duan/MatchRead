#!/usr/bin/env node
/**
 * CI guard for the live ingestion and listener branch.
 *
 * Fails if those implementation files name settleAll, apply_grades, or
 * apply_bracket_state. Tests and docs are not scanned.
 *
 * Intentional test references, kept out of this scan:
 * - packages/provider-rapidapi/src/live-frame.test.js
 *   The test lists those three names and asserts the live sources do not
 *   contain them. That mention is the assertion, not a settlement call.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");

const files = [
  "packages/provider-rapidapi/src/live-frame.js",
  "packages/provider-rapidapi/src/live-normalize.js",
  "packages/provider-rapidapi/src/live-ingest.js",
  "packages/provider-rapidapi/src/live-repository.js",
  "packages/provider-rapidapi/src/live.js",
  "packages/provider-rapidapi/src/listener-overlap.js",
  "packages/provider-rapidapi/src/listener-heartbeat.js",
  "packages/provider-rapidapi/src/live-ingest-mode.js",
  "packages/provider-rapidapi/src/live-archive.js",
  "packages/provider-rapidapi/src/reconnect.js",
  "packages/provider-rapidapi/src/live-session.js",
  "scripts/replay-live.mjs",
  "packages/provider-rapidapi/src/live-replay-harness.js",
  "packages/provider-rapidapi/src/live-replay-clock.js",
  "scripts/live-listener.mjs",
  "supabase/functions/_shared/project-live.ts",
  "supabase/functions/_shared/clear-live.ts",
  "supabase/functions/_shared/sweep-live.ts",
];

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) acc.push(path);
  }
  return acc;
}

const liveUi = [
  ...walk(join(root, "apps/web/components/live"), []),
  ...walk(join(root, "apps/web/lib/live"), []),
  ...walk(join(root, "apps/listener/src"), []),
];
const paths = [...files.map((file) => join(root, file)), ...liveUi].filter(
  (file) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
);

const settlementReach = ["settleAll", "apply_grades", "apply_bracket_state"];

const forbidden = [
  "advanceWinnerToParent",
  "mergeSettledFact",
  "claim_settlement",
  "reasonsFor",
  "consequenceEngine",
  "classifyImportance",
  "forwardExposure",
  "urgentTakeover",
  "projectedStandings",
  "leagueSwing",
  "visitorLive",
  "heatScore",
  "pulseAlert",
  "socket.io",
];

const offenders = [];
for (const path of paths) {
  const text = readFileSync(path, "utf8");
  const rel = relative(root, path).replace(/\\/g, "/");
  for (const name of settlementReach) {
    if (text.includes(name)) offenders.push(`${rel} can reach ${name}`);
  }
  for (const name of forbidden) {
    if (text.includes(name)) offenders.push(`${rel} mentions ${name}`);
  }
  if (/\.from\(\s*["']matches["']\s*\)\s*\.(update|insert|upsert|delete)/.test(text)) {
    offenders.push(`${rel} writes matches`);
  }
  if (
    rel !== "apps/web/lib/live/trust.ts" &&
    /\b(winner_side|winner_player_id)\s*:/.test(text)
  ) {
    offenders.push(`${rel} assigns an official winner`);
  }
  if (
    rel !== "supabase/functions/_shared/project-live.ts" &&
    rel !== "packages/provider-rapidapi/src/live-ingest.js" &&
    text.includes('from("matches")')
  ) {
    offenders.push(`${rel} reads matches`);
  }
}

if (offenders.length) {
  console.error(offenders.join("\n"));
  process.exit(1);
}
console.log(`live trust guard ok (${paths.length} files)`);
