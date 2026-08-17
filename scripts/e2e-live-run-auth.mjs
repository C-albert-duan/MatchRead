#!/usr/bin/env node
/**
 * Run live auth checklist with service-role magic-link sign-in (no email OTP).
 * Loads keys from .env.docker / .env.provider and Supabase CLI api-keys.
 *
 *   node scripts/e2e-live-run-auth.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i);
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(resolve(root, ".env.docker"));
loadEnv(resolve(root, ".env.provider"));
process.env.LIVE_BASE_URL =
  process.env.LIVE_BASE_URL || "https://www.matchreadtennis.com";

if (!process.env.E2E_SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const raw = execFileSync(
      npx,
      [
        "--yes",
        "supabase",
        "projects",
        "api-keys",
        "--project-ref",
        process.env.SUPABASE_PROJECT_REF || "opugihofwvunwkpcmboq",
      ],
      { encoding: "utf8", cwd: root, shell: true }
    );
    const parsed = JSON.parse(raw);
    const service = (parsed.keys || []).find(
      (k) => k.name === "service_role" || k.id === "service_role"
    );
    if (service?.api_key) {
      process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = service.api_key;
    }
  } catch (e) {
    console.error("Could not load service_role via supabase CLI:", e.message);
  }
}

if (!process.env.E2E_SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing E2E_SUPABASE_SERVICE_ROLE_KEY — aborting.");
  process.exit(1);
}

console.log("Running auth checklist (admin magic-link sign-in)…");
const r = spawnSync(
  "npx",
  ["playwright", "test", "e2e/live-checklist-auth.spec.ts", "--reporter=list"],
  {
    cwd: resolve(root, "apps/web"),
    env: process.env,
    stdio: "inherit",
    shell: true,
  }
);
process.exit(r.status ?? 1);
