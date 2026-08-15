#!/usr/bin/env node
/**
 * MatchRead tennis-facts worker.
 *
 * Optional local / Docker process. Production poller is
 * supabase/functions/sync-tennis (RAPIDAPI_KEY in Supabase secrets).
 * Does not hold SUPABASE_SERVICE_ROLE_KEY. Not Vercel.
 *
 *   npm run worker
 *   npm run worker:once
 */
import http from "node:http";
import { loadEnv, ms, requireEnv } from "./env.js";
import { publishDraws } from "./jobs/publish.js";
import { reconcileResults } from "./jobs/reconcile.js";
import { startLiveSocket } from "./jobs/live.js";

const startedAt = new Date().toISOString();
const state = {
  ok: true,
  startedAt,
  lastPublish: null,
  lastReconcile: null,
  lastError: null,
};

function parseArgs(argv) {
  return {
    once: argv.includes("--once"),
    dryRun: argv.includes("--dry-run"),
  };
}

async function runJob(name, fn) {
  const t0 = Date.now();
  try {
    const summary = await fn();
    const result = { at: new Date().toISOString(), ms: Date.now() - t0, summary };
    console.log(name, "ok", JSON.stringify(summary), `${result.ms}ms`);
    state.lastError = null;
    state.ok = true;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state.lastError = { at: new Date().toISOString(), job: name, message };
    state.ok = false;
    console.error(name, "fail", message);
    return { at: new Date().toISOString(), ms: Date.now() - t0, error: message };
  }
}

function startHealthServer(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://worker.local");
    if (url.pathname === "/health" || url.pathname === "/") {
      const body = JSON.stringify({
        service: "matchread-worker",
        ok: state.ok,
        startedAt: state.startedAt,
        lastPublish: state.lastPublish,
        lastReconcile: state.lastReconcile,
        lastError: state.lastError,
      });
      res.writeHead(state.ok ? 200 : 503, {
        "Content-Type": "application/json",
      });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  server.listen(port, () => {
    console.log(`worker health http://0.0.0.0:${port}/health`);
  });
  return server;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  requireEnv(env, ["RAPIDAPI_KEY"]);
  if (!args.dryRun) {
    requireEnv(env, ["MATCHREAD_INGEST_URL", "INGEST_SECRET"]);
  }

  const publishEvery = ms(env, "WORKER_PUBLISH_MS", 15 * 60 * 1000);
  const reconcileEvery = ms(env, "WORKER_RECONCILE_MS", 60 * 1000);
  const port = Number(env.PORT) || 8080;

  const tickPublish = () =>
    runJob("publish", () => publishDraws(env, { dryRun: args.dryRun })).then(
      (r) => {
        state.lastPublish = r;
      }
    );
  const tickReconcile = () =>
    runJob("reconcile", () =>
      reconcileResults(env, { dryRun: args.dryRun })
    ).then((r) => {
      state.lastReconcile = r;
    });

  console.log(
    `worker start publish=${publishEvery}ms reconcile=${reconcileEvery}ms dryRun=${args.dryRun}`
  );

  await tickPublish();
  await tickReconcile();

  if (args.once) {
    if (state.lastError) process.exit(1);
    return;
  }

  const server = startHealthServer(port);
  const live = await startLiveSocket(env, { dryRun: args.dryRun });
  if (!live.ok) {
    console.warn("live socket off —", live.reason, "(REST reconcile still runs)");
  }
  const publishTimer = setInterval(() => {
    tickPublish().catch((err) => console.error(err));
  }, publishEvery);
  const reconcileTimer = setInterval(() => {
    tickReconcile().catch((err) => console.error(err));
  }, reconcileEvery);

  const stop = () => {
    clearInterval(publishTimer);
    clearInterval(reconcileTimer);
    live.stop?.();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
