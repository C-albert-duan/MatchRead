// Fix list P2-4: provider and ingest requests time out, and connectLive does
// not leak an abort listener per reconnect.
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { describe, it } from "node:test";
import { connectLive, createClient, requestSignal } from "./index.js";

function token() {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: "none" })}.${part({ exp: now + 3600, iat: now })}.sig`;
}

describe("requestSignal", () => {
  it("aborts after the timeout", async () => {
    const signal = requestSignal(null, 20);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(signal.aborted, true);
  });

  it("aborts when the stop signal does", () => {
    const stop = new AbortController();
    const signal = requestSignal(stop.signal, 60_000);
    assert.equal(signal.aborted, false);
    stop.abort();
    assert.equal(signal.aborted, true);
  });
});

describe("createClient", () => {
  it("gives up on a hung provider request", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      });
    // AbortSignal.timeout's timer is unref'd, and this fake fetch holds no
    // socket, so nothing else keeps the event loop alive while it waits. A
    // real hung request holds its socket open.
    const keepAlive = setInterval(() => {}, 1_000);
    try {
      const client = createClient({ key: "k", timeoutMs: 20 });
      await assert.rejects(client.get("/hang"), (error) => error?.name === "TimeoutError");
    } finally {
      clearInterval(keepAlive);
      globalThis.fetch = realFetch;
    }
  });
});

describe("connectLive", () => {
  it("removes its listener from the stop signal on close", async () => {
    const stop = new AbortController();
    const client = {
      async get() {
        return { success: true, token: token() };
      },
    };
    for (let i = 0; i < 5; i++) {
      const live = await connectLive({ RAPIDAPI_KEY: "k" }, client, { info() {} }, { signal: stop.signal });
      live.close();
    }
    assert.equal(getEventListeners(stop.signal, "abort").length, 0);
  });
});
