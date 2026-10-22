#!/usr/bin/env node
/**
 * Replay listener. Reads a local file and projects it through acceptForwardedLive.
 * It does not open a provider socket.
 *
 *   npm run listen:live
 *   npm run listen:live -- fixtures/live-replay/chaos.ndjson
 *   npm run listen:live -- --write
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { openProviderSocket } from "@matchread/provider-rapidapi";
import {
  PROTOTYPE_TIMELINE,
  catalogCoversFrames,
  createReplayAdmin,
  liveRows,
  readReplayFrames,
  replayThroughIngest,
  seedCapturedPairs,
  seedReplayCatalog,
} from "../packages/provider-rapidapi/src/live-replay-harness.js";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const root = resolve(import.meta.dirname, "..");
const env = {
  ...loadEnvFile(resolve(root, ".env")),
  ...loadEnvFile(resolve(root, ".env.local")),
  ...loadEnvFile(resolve(root, ".env.docker")),
  ...process.env,
};

try {
  openProviderSocket(env);
} catch (err) {
  if (err && err.code === "SOCKET_UNVERIFIED") {
    console.error("BLOCKED: provider socket stays closed. Replay a captured file.");
    process.exit(2);
  }
}

const args = process.argv.slice(2);
const write = args.includes("--write");
let file = resolve(root, PROTOTYPE_TIMELINE);
let catalogPath = resolve(root, "fixtures/live-replay/catalog.json");
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--catalog") catalogPath = resolve(args[++i] || "");
  else if (arg.startsWith("--catalog=")) catalogPath = resolve(arg.slice(10));
  else if (!arg.startsWith("--")) file = resolve(arg);
}

const frames = readReplayFrames(file);
const log = [];

if (!write) {
  const admin = createReplayAdmin();
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (catalogCoversFrames(catalog, frames)) seedReplayCatalog(admin, catalog);
  else seedCapturedPairs(admin, frames);
  const result = await replayThroughIngest(admin, frames, log);
  console.log(
    JSON.stringify({ file, transport: "replay", result, rows: liveRows(admin), log }, null, 2)
  );
  process.exit(0);
}

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("BLOCKED: --write needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const result = await replayThroughIngest(admin, frames, log);
console.log(JSON.stringify({ file, transport: "replay", result, log }, null, 2));
