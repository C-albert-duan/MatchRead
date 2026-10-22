#!/usr/bin/env node
/**
 * Read-only proof that settlement and reconciliation cron jobs have run.
 * Does not schedule, invoke, or write.
 *
 *   node scripts/prove-cron.mjs
 *
 * Exit 0 — jobs are active, latest runs succeeded, Vault has project_url
 *          and ingest_secret so invoke_* can POST to Edge.
 * Exit 1 — proof failed (including local DB with empty Vault: cron "succeeded"
 *          rows do not mean Edge ran).
 * Exit 2 — BLOCKED: no DATABASE_URL or psql could not run.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { evaluateCronProof } from "./lib/cron-proof.mjs";

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

const snapshotSql = `
select json_build_object(
  'jobs', coalesce((
    select json_agg(json_build_object(
      'jobname', jobname,
      'schedule', schedule::text,
      'active', active
    ) order by jobname)
    from cron.job
   where jobname in ('sync-facts-5m', 'settle-leagues')
  ), '[]'::json),
  'latestRuns', coalesce((
    select json_agg(json_build_object(
      'jobname', jobname,
      'status', status,
      'start_time', start_time,
      'return_message', return_message
    ) order by jobname)
    from (
      select distinct on (j.jobname)
             j.jobname,
             d.status,
             d.start_time,
             d.return_message
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
       where j.jobname in ('sync-facts-5m', 'settle-leagues')
       order by j.jobname, d.start_time desc
    ) latest
  ), '[]'::json),
  'vault', json_build_object(
    'projectUrl', coalesce((
      select exists (
        select 1
          from vault.decrypted_secrets
         where name = 'project_url'
           and coalesce(btrim(decrypted_secret::text), '') <> ''
      )
    ), false),
    'ingestSecret', coalesce((
      select exists (
        select 1
          from vault.decrypted_secrets
         where name = 'ingest_secret'
           and coalesce(btrim(decrypted_secret::text), '') <> ''
      )
    ), false)
  )
) as snapshot;
`;

function runPsql(sql) {
  return spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
    { encoding: "utf8" }
  );
}

const psql = runPsql(snapshotSql);

if (psql.error) {
  console.error(
    `BLOCKED: psql could not run (${psql.error.message}). Cron history was not read.`
  );
  process.exit(2);
}

if (psql.status !== 0) {
  process.stderr.write(psql.stderr || "");
  console.error("BLOCKED: cron snapshot query failed.");
  process.exit(2);
}

/** @type {{ jobs: unknown; latestRuns: unknown; vault: unknown }} */
let snapshot;
try {
  snapshot = JSON.parse((psql.stdout || "").trim());
} catch (err) {
  console.error("BLOCKED: could not parse cron snapshot JSON.", err);
  process.exit(2);
}

const result = evaluateCronProof({
  jobs: Array.isArray(snapshot.jobs) ? snapshot.jobs : [],
  latestRuns: Array.isArray(snapshot.latestRuns) ? snapshot.latestRuns : [],
  vault:
    snapshot.vault && typeof snapshot.vault === "object"
      ? snapshot.vault
      : { projectUrl: false, ingestSecret: false },
});

console.log("cron.job (sync-facts-5m, settle-leagues):");
for (const job of snapshot.jobs ?? []) {
  console.log(
    `  ${job.jobname}\tschedule=${job.schedule}\tactive=${job.active}`
  );
}

console.log("\nlatest cron.job_run_details per job:");
for (const run of snapshot.latestRuns ?? []) {
  console.log(
    `  ${run.jobname}\t${run.status}\t${run.start_time ?? ""}\t${run.return_message ?? ""}`
  );
}

console.log(
  `\nVault: project_url=${Boolean(snapshot.vault?.projectUrl)} ingest_secret=${Boolean(snapshot.vault?.ingestSecret)}`
);

for (const warning of result.warnings) {
  console.warn(`WARN: ${warning}`);
}

if (!result.ok) {
  console.error("\nCRON PROOF FAILED:");
  for (const message of result.errors) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log("\nOK: cron jobs are armed and Vault can POST to Edge.");
process.exit(0);
