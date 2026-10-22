import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STALE_AFTER_MS } from "@matchread/provider-rapidapi";
import {
  healthPort,
  listenerHealthResponse,
  startListenerHealth,
  type ListenerHealthState,
} from "./health.ts";
import { runListener, runOnce } from "./main.ts";
import { createListenerSession } from "./session.ts";
import { createShutdown } from "./shutdown.ts";

const ready: ListenerHealthState = { draining: false, attempts: 1, lastSuccessAt: 1_000 };

describe("listener health", () => {
  it("stays unready until a read, then fails when that read is quiet or the process is stopping", () => {
    assert.deepEqual(listenerHealthResponse({ draining: false, attempts: 0, lastSuccessAt: null }, 1_000), {
      status: 503,
      body: { status: "starting" },
    });
    assert.deepEqual(listenerHealthResponse(ready, ready.lastSuccessAt! + STALE_AFTER_MS), {
      status: 200,
      body: { status: "ok" },
    });
    assert.deepEqual(listenerHealthResponse(ready, ready.lastSuccessAt! + STALE_AFTER_MS + 1), {
      status: 503,
      body: { status: "stale" },
    });
    assert.deepEqual(
      listenerHealthResponse({ draining: false, attempts: 1, lastSuccessAt: null }, 5_000),
      { status: 503, body: { status: "stale" } }
    );
    assert.deepEqual(listenerHealthResponse({ ...ready, draining: true }, ready.lastSuccessAt!), {
      status: 503,
      body: { status: "draining" },
    });
    assert.equal(healthPort({}), 8080);
    assert.equal(healthPort({ PORT: "3002" }), 3002);
    assert.equal(healthPort({ PORT: "0" }), 8080);
  });

  it("answers GET /health and no other path", async () => {
    const state: ListenerHealthState = { draining: false, attempts: 0, lastSuccessAt: null };
    const server = await startListenerHealth(state, 0);
    try {
      const health = await fetch(`http://127.0.0.1:${server.port}/health`);
      assert.equal(health.status, 503);
      assert.deepEqual(await health.json(), { status: "starting" });
      state.attempts = 1;
      state.lastSuccessAt = Date.now();
      const ok = await fetch(`http://127.0.0.1:${server.port}/health?token=hidden`);
      assert.equal(ok.status, 200);
      assert.deepEqual(await ok.json(), { status: "ok" });
      const other = await fetch(`http://127.0.0.1:${server.port}/`);
      assert.equal(other.status, 404);
    } finally {
      await server.close();
    }
  });
});

describe("listener shutdown", () => {
  it("ends a wait when shutdown is requested", async () => {
    const gate = createShutdown();
    const pending = gate.sleep(60_000);
    gate.request();
    await pending;
    assert.equal(gate.requested(), true);
    await gate.sleep(60_000);
  });

  it("does not read again after the stop, and posts one disconnected heartbeat", async () => {
    const bodies: Array<{ listenerHeartbeat?: { connected?: boolean } }> = [];
    let reads = 0;
    let stopped = false;
    await runListener({
      env: {
        RAPIDAPI_KEY: "from-env",
        MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
        INGEST_SECRET: "ingest-secret",
        LISTENER_POLL_MS: "5000",
      },
      info: () => {},
      stopped: () => stopped,
      connect: async () => ({
        transport: "rest" as const,
        host: "example.test",
        reconnect: async () => false,
        tokenAgeSec: () => 12,
        getLiveEvents: async () => {
          reads += 1;
          return { events: [{ id: "1", score: "1-0" }], raw: null };
        },
      }),
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ carriedProviderIds: [], heartbeat: true }), { status: 200 });
      },
      sleep: async () => {
        stopped = true;
      },
    });
    assert.equal(reads, 1);
    const beats = bodies.filter((body) => body.listenerHeartbeat);
    assert.equal(beats.at(-1)?.listenerHeartbeat?.connected, false);
  });

  it("cancels an unfinished batch and does not reconnect", async () => {
    const controller = new AbortController();
    let reads = 0;
    let closed = 0;
    const bodies: Array<{ liveFrames?: unknown[]; listenerHeartbeat?: { connected?: boolean } }> = [];
    await runListener({
      env: {
        RAPIDAPI_KEY: "from-env",
        MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
        INGEST_SECRET: "ingest-secret",
        LISTENER_POLL_MS: "5000",
      },
      info: () => {},
      signal: controller.signal,
      stopped: () => controller.signal.aborted,
      connect: async () => ({
        tokenAgeSec: () => 1,
        close: () => {
          closed += 1;
        },
        getLiveEvents: async () => {
          reads += 1;
          return { events: [{ id: "1", score: "1-0" }] };
        },
      }),
      fetchImpl: (_url, init) =>
        new Promise((resolve, reject) => {
          const body = JSON.parse(String(init?.body));
          if (Array.isArray(body.liveFrames) && body.liveFrames.length > 0) {
            const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            if (init?.signal?.aborted) fail();
            else init?.signal?.addEventListener("abort", fail, { once: true });
            controller.abort();
            return;
          }
          bodies.push(body);
          resolve(new Response(JSON.stringify({ heartbeat: true }), { status: 200 }));
        }),
      sleep: async () => {
        throw new Error("reconnect wait");
      },
    });
    assert.equal(reads, 1);
    assert.ok(closed >= 1);
    assert.equal(bodies.at(-1)?.listenerHeartbeat?.connected, false);
  });

  it("leaves an aborted batch uncommitted so the same row is still pending", async () => {
    const session = createListenerSession();
    const controller = new AbortController();
    const frame = { id: "1", score: "1-0" };
    const pending = runOnce({
      env: {
        MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
        INGEST_SECRET: "ingest-secret",
      },
      session,
      signal: controller.signal,
      live: {
        tokenAgeSec: () => 1,
        getLiveEvents: async () => ({ events: [frame] }),
      },
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          if (init?.signal?.aborted) fail();
          else init?.signal?.addEventListener("abort", fail, { once: true });
          controller.abort();
        }),
    });
    await assert.rejects(pending);
    assert.deepEqual(
      session.takeChanged([frame]).map((row) => row.id),
      ["1"]
    );
  });
});
