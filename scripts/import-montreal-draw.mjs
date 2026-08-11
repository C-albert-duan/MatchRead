#!/usr/bin/env node
/**
 * Thin wrapper — prefer: node scripts/import-nbo-draw.mjs --tour atp
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2).filter((a) => a !== "--tour");
const result = spawnSync(
  process.execPath,
  [resolve("scripts/import-nbo-draw.mjs"), "--tour", "atp", ...args],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
