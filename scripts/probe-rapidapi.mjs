#!/usr/bin/env node
/**
 * Probe RapidAPI Tennis API (Basic plan).
 * Usage (from repo root):
 *   node scripts/probe-rapidapi.mjs
 *   node scripts/probe-rapidapi.mjs fixtures
 *
 * Loads RAPIDAPI_KEY / RAPIDAPI_HOST from .env.provider (gitignored).
 * Never prints the key.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvProvider() {
  const path = resolve(process.cwd(), ".env.provider");
  if (!existsSync(path)) {
    console.error("Missing .env.provider — copy .env.provider.example and set RAPIDAPI_KEY.");
    process.exit(1);
  }
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnvProvider();
const key = env.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
const host = env.RAPIDAPI_HOST || process.env.RAPIDAPI_HOST || "tennis-api-atp-wta-itf.p.rapidapi.com";

if (!key || key.startsWith("<")) {
  console.error("RAPIDAPI_KEY is missing or still a placeholder in .env.provider");
  process.exit(1);
}

const mode = (process.argv[2] || "ranking").toLowerCase();
const paths = {
  ranking: "/tennis/v2/atp/ranking/singles?race=true",
  // date fixtures — today UTC YYYY-MM-DD
  fixtures: `/tennis/v2/atp/fixtures/${new Date().toISOString().slice(0, 10)}`,
};

const path = paths[mode];
if (!path) {
  console.error(`Unknown mode "${mode}". Use: ranking | fixtures`);
  process.exit(1);
}

const url = `https://${host}${path}`;
const res = await fetch(url, {
  headers: {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": host,
    Accept: "application/json",
  },
});

const text = await res.text();
console.log(`mode=${mode}`);
console.log(`url=${url}`);
console.log(`status=${res.status}`);
console.log(text.slice(0, 500));
if (text.length > 500) console.log(`… (${text.length} chars total)`);

if (!res.ok) {
  console.error("\nFAIL — check subscription (Basic), key, and host.");
  process.exit(1);
}
console.log("\nOK — Basic plan auth works.");
