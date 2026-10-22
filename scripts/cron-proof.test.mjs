import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateCronProof,
  REQUIRED_CRON_JOBS,
} from "./lib/cron-proof.mjs";

const activeJobs = REQUIRED_CRON_JOBS.map((jobname) => ({
  jobname,
  schedule: jobname === "sync-facts-5m" ? "*/5 * * * *" : "*/15 * * * *",
  active: true,
}));

const succeededRuns = REQUIRED_CRON_JOBS.map((jobname) => ({
  jobname,
  status: "succeeded",
  start_time: "2026-10-07T18:00:00.000Z",
  return_message: "1 row",
}));

test("succeeded cron rows with empty Vault fail — the original false-positive class", () => {
  const result = evaluateCronProof({
    jobs: activeJobs,
    latestRuns: succeededRuns,
    vault: { projectUrl: false, ingestSecret: false },
  });
  assert.equal(result.ok, false);
  assert.equal(result.vaultReady, false);
  assert.ok(
    result.errors.some((message) => message.includes("Vault secrets")),
    result.errors
  );
  assert.ok(
    result.errors.some((message) => message.includes("not evidence that Edge ran"))
  );
});

test("succeeded runs with both Vault secrets pass", () => {
  const result = evaluateCronProof({
    jobs: activeJobs,
    latestRuns: succeededRuns,
    vault: { projectUrl: true, ingestSecret: true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.vaultReady, true);
});

test("missing job row fails", () => {
  const result = evaluateCronProof({
    jobs: activeJobs.filter((job) => job.jobname !== "settle-leagues"),
    latestRuns: succeededRuns,
    vault: { projectUrl: true, ingestSecret: true },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("settle-leagues")));
});

test("inactive job fails", () => {
  const result = evaluateCronProof({
    jobs: activeJobs.map((job) =>
      job.jobname === "sync-facts-5m" ? { ...job, active: false } : job
    ),
    latestRuns: succeededRuns,
    vault: { projectUrl: true, ingestSecret: true },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("not active")));
});

test("latest run not succeeded fails even when Vault is configured", () => {
  const result = evaluateCronProof({
    jobs: activeJobs,
    latestRuns: succeededRuns.map((run) =>
      run.jobname === "sync-facts-5m"
        ? { ...run, status: "failed" }
        : run
    ),
    vault: { projectUrl: true, ingestSecret: true },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("not succeeded")));
});

test("only one Vault secret fails like local skip", () => {
  const result = evaluateCronProof({
    jobs: activeJobs,
    latestRuns: succeededRuns,
    vault: { projectUrl: true, ingestSecret: false },
  });
  assert.equal(result.ok, false);
  assert.equal(result.vaultReady, false);
});

test("no run history fails", () => {
  const result = evaluateCronProof({
    jobs: activeJobs,
    latestRuns: [],
    vault: { projectUrl: true, ingestSecret: true },
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((message) => message.includes("no cron.job_run_details"))
  );
});
