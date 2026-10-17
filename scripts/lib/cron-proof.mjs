/**
 * Cron proof rules for sync-facts and settle-leagues.
 *
 * pg_cron records succeeded when the SQL command finishes. invoke_sync_facts
 * and invoke_settle_leagues return null without calling net.http_post when
 * Vault secrets are missing. return_message is still "1 row" in both cases.
 */

export const REQUIRED_CRON_JOBS = ["settle-leagues", "sync-facts-5m"];

/**
 * @param {{
 *   jobs: Array<{ jobname: string; schedule?: string; active: boolean }>;
 *   latestRuns: Array<{
 *     jobname: string;
 *     status: string;
 *     start_time?: string | null;
 *     return_message?: string | null;
 *   }>;
 *   vault: { projectUrl: boolean; ingestSecret: boolean };
 * }} input
 */
export function evaluateCronProof(input) {
  const errors = [];
  const warnings = [];

  const jobsByName = new Map(
    (input.jobs ?? []).map((row) => [row.jobname, row])
  );
  const runsByName = new Map(
    (input.latestRuns ?? []).map((row) => [row.jobname, row])
  );

  for (const jobname of REQUIRED_CRON_JOBS) {
    const job = jobsByName.get(jobname);
    if (!job) {
      errors.push(`missing cron.job row: ${jobname}`);
      continue;
    }
    if (!job.active) {
      errors.push(`${jobname} is not active`);
    }
  }

  for (const jobname of REQUIRED_CRON_JOBS) {
    const run = runsByName.get(jobname);
    if (!run) {
      errors.push(`no cron.job_run_details row for ${jobname}`);
      continue;
    }
    if (run.status !== "succeeded") {
      errors.push(
        `latest ${jobname} run status is ${run.status}, not succeeded`
      );
    }
  }

  const vaultReady =
    Boolean(input.vault?.projectUrl) && Boolean(input.vault?.ingestSecret);

  if (!vaultReady) {
    errors.push(
      "Vault secrets project_url and ingest_secret are not both set. " +
        "invoke_sync_facts and invoke_settle_leagues return without net.http_post. " +
        "cron.job_run_details status succeeded is not evidence that Edge ran."
    );
  } else if (
    (input.latestRuns ?? []).some(
      (run) =>
        run.return_message?.trim() === "1 row" &&
        REQUIRED_CRON_JOBS.includes(run.jobname)
    )
  ) {
    warnings.push(
      "return_message is only the row count. Proof relies on Vault being configured so invoke returns a net.http_post id."
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    vaultReady,
  };
}
