#!/usr/bin/env node
/**
 * Read-only proof that settlement and reconciliation cron jobs have run.
 * Does not schedule, invoke, or write.
 *
 *   node scripts/prove-cron.mjs
 *
 * Exits 2 when no database URL is available — that check is BLOCKED.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

const env = {
  ...loadEnvFile(".env.provider"),
  ...loadEnvFile(".env"),
  ...process.env,
};

const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || "";
if (!databaseUrl || databaseUrl.startsWith("<")) {
  console.error(
    "BLOCKED: DATABASE_URL is not set. Cron job history was not read."
  );
  process.exit(2);
}

const sql = `
select jobname, schedule, active
  from cron.job
 where jobname in ('sync-facts-5m', 'settle-leagues')
 order by jobname;
select j.jobname, d.status, d.start_time, d.end_time
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
 where j.jobname in ('sync-facts-5m', 'settle-leagues')
 order by d.start_time desc
 limit 20;
`;

const psql = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
  encoding: "utf8",
});

if (psql.error) {
  console.error(
    `BLOCKED: psql could not run (${psql.error.message}). Cron history was not read.`
  );
  process.exit(2);
}

process.stdout.write(psql.stdout || "");
process.stderr.write(psql.stderr || "");
process.exit(psql.status ?? 1);
