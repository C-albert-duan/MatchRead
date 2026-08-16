import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function loadEnv() {
  return {
    ...loadEnvFile(resolve(ROOT, ".env.provider")),
    ...loadEnvFile(resolve(ROOT, "apps/web/.env.local")),
    ...loadEnvFile(resolve(process.cwd(), ".env.provider")),
    ...process.env,
  };
}

export function requireEnv(env, keys) {
  const missing = keys.filter((k) => !env[k] || String(env[k]).startsWith("<"));
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

export function ms(env, name, fallback) {
  const n = Number(env[name]);
  return Number.isFinite(n) && n >= 5_000 ? n : fallback;
}

export function supabaseRest(env) {
  const ingest = env.MATCHREAD_INGEST_URL || "";
  const fromIngest = ingest.includes("/functions/v1/")
    ? ingest.replace(/\/functions\/v1\/.*$/, "")
    : "";
  const url = (
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    fromIngest
  ).replace(/\/$/, "");
  const key =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return { url, key };
}

export function rebuildUrl(env) {
  const ingest = env.MATCHREAD_INGEST_URL || "";
  if (!ingest) return "";
  return ingest.replace(/\/ingest-events\/?$/, "/rebuild-draw");
}

export function settleUrl(env) {
  const ingest = env.MATCHREAD_INGEST_URL || "";
  if (!ingest) return "";
  return ingest.replace(/\/ingest-events\/?$/, "/settle-leagues");
}
