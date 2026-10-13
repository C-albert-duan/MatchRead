#!/usr/bin/env node
/**
 * Append raw provider frames as NDJSON.
 * Does not normalize, map matches, settle, or write a database.
 *
 * There is no socket client in this repository. The live feed this script
 * opens is the existing REST live call. WTA calendar, and WTA fixture /
 * results / info when a live row carries a tournament id, are stored as
 * the same kind of raw text frame.
 *
 *   npm run capture:live
 *
 * Writes fixtures/live-capture-oct-2026/frames.ndjson (gitignored; may
 * contain a ws token). Exits 2 when RAPIDAPI_KEY is missing.
 * The printed report is paths and sizes only.
 */
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  bindProcessSignals,
  captureReport,
  createClient,
  createFrameRecorder,
  runLiveCapture,
} from "@matchread/provider-rapidapi";

function loadEnvProvider() {
  const path = resolve(process.cwd(), ".env.provider");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnvProvider(), ...process.env };
const key = env.RAPIDAPI_KEY;
const host = env.RAPIDAPI_HOST || "tennis-api-atp-wta-itf.p.rapidapi.com";

if (!key || key.startsWith("<")) {
  console.error(
    "BLOCKED: RAPIDAPI_KEY is missing. No provider bytes were captured."
  );
  process.exit(2);
}

const outFile = resolve(
  process.cwd(),
  "fixtures",
  "live-capture-oct-2026",
  "frames.ndjson"
);
const recorder = createFrameRecorder(outFile);
bindProcessSignals(recorder);

/** @type {Map<string, { path: string, status: number, bodyText: string }>} */
const pending = new Map();
const client = createClient({
  key,
  host,
  onRawBody: (row) => {
    pending.set(row.path, {
      path: row.path,
      status: row.status,
      bodyText: row.bodyText,
    });
  },
});

await runLiveCapture({
  recorder,
  year: new Date().getUTCFullYear(),
  read: async (path) => {
    try {
      await client.get(path);
    } catch {
      /* The body, when the provider sent one, is already in pending. */
    }
    const row = pending.get(path);
    pending.delete(path);
    if (!row) throw new Error("no body");
    return row;
  },
});

const lines = (await readFile(outFile, "utf8"))
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
console.log(
  JSON.stringify(
    {
      file: "fixtures/live-capture-oct-2026/frames.ndjson",
      ...captureReport(lines),
    },
    null,
    2
  )
);
