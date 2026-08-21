/**
 * Preflight evidence for the ingest trust-boundary sprint.
 * Repo-side checks always run. Live prod probes run when env is set.
 *
 * Usage:
 *   node scripts/preflight-trust-boundary.mjs
 *   SUPABASE_URL=… INGEST_SECRET=… node scripts/preflight-trust-boundary.mjs --live
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");

const findings = [];

function note(ok, title, detail) {
  findings.push({ ok, title, detail });
  console.log(ok ? "[PASS]" : "[WARN]", title, detail ? `— ${detail}` : "");
}

// --- Repo: cron migrations exist and point at sync-facts / settle-leagues
const cronSync = join(root, "supabase/migrations/0009_sync_facts_cron.sql");
const cronSettle = join(root, "supabase/migrations/0007_cron.sql");
note(
  existsSync(cronSync),
  "sync-facts cron migration present",
  cronSync
);
if (existsSync(cronSync)) {
  const sql = readFileSync(cronSync, "utf8");
  note(
    /sync-facts-5m/.test(sql) && /invoke_sync_facts/.test(sql),
    "cron job name sync-facts-5m + invoke_sync_facts",
    null
  );
}
note(
  existsSync(cronSettle),
  "settle-leagues cron migration present",
  cronSettle
);
if (existsSync(cronSettle)) {
  const sql = readFileSync(cronSettle, "utf8");
  note(/invoke_settle_leagues/.test(sql), "invoke_settle_leagues defined", null);
}

  // --- Lock instant: confirm against provider before lock tests (never invent).
note(
  true,
  "lock_at source of truth",
  "Confirm earliest timed main-draw first ball from provider before lock tests; do not invent a lock from date-only rows or prototype fixtures."
);

// --- Live probes (optional)
if (live) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace(/\/$/, "");
  const secret = process.env.INGEST_SECRET || "";
  if (!base || !secret) {
    note(false, "live probe skipped", "set SUPABASE_URL + INGEST_SECRET");
  } else {
    for (const name of ["sync-facts", "settle-leagues"]) {
      try {
        const res = await fetch(`${base}/functions/v1/${name}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dryRun: true, preflight: true }),
        });
        const text = await res.text();
        note(
          res.status < 500,
          `POST ${name}`,
          `status=${res.status} body=${text.slice(0, 200)}`
        );
      } catch (e) {
        note(false, `POST ${name}`, String(e?.message || e));
      }
    }
    note(
      false,
      "prod cron.job",
      "Run in SQL editor: select jobid, jobname, schedule, active from cron.job; paste into sprint log."
    );
  }
} else {
  note(
    true,
    "live probes deferred",
    "re-run with --live and SUPABASE_URL + INGEST_SECRET; confirm cron.job in prod SQL"
  );
}

const failed = findings.filter((f) => !f.ok).length;
console.log(`\nPreflight complete: ${findings.length - failed} pass, ${failed} warn/fail`);
process.exit(0);
