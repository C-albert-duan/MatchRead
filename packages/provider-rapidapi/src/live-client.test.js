import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { connectLive, createClient } from "./index.js";
import { getWsToken, isTokenExpired, proactiveRefreshEnabled, tokenExpiry, WS_TOKEN_PATH } from "./live.js";
import { openProviderSocket } from "./live-frame.js";

const TOKEN_EXPIRED = JSON.stringify({ level: "info", name: "token_expired" });

function token(claims) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("captured ws-token shape", () => {
  it("reads the observed path and the success/token body", async () => {
    const calls = [];
    const result = await getWsToken({
      async get(path) {
        calls.push(path);
        return { success: true, token: "  aaa.bbb.ccc  " };
      },
    });
    assert.deepEqual(calls, [WS_TOKEN_PATH]);
    assert.equal(WS_TOKEN_PATH, "/tennis/v2/extend/api/ws-token");
    assert.equal(result.token, "aaa.bbb.ccc");
  });

  it("ignores token fields the capture did not have", async () => {
    for (const body of [
      { accessToken: "nope" },
      { data: { token: "nope" } },
      { result: { token: "nope" } },
      { success: false, token: "nope" },
      { success: true, token: "" },
      { success: true },
    ]) {
      const result = await getWsToken({
        async get() {
          return body;
        },
      });
      assert.equal(result.token, null);
    }
  });
});

describe("connectLive", () => {
  it("uses the environment key and does not open a socket", async () => {
    let reads = 0;
    await assert.rejects(
      () =>
        connectLive({}, {
          async get() {
            reads += 1;
            return { success: true, token: "aaa.bbb.ccc" };
          },
        }),
      (error) => error.code === "PROVIDER_KEY"
    );
    assert.equal(reads, 0);

    const calls = [];
    const session = await connectLive(
      { RAPIDAPI_KEY: "from-env", RAPIDAPI_HOST: "example.test" },
      {
        host: "example.test",
        async get(path) {
          calls.push(path);
          if (path === WS_TOKEN_PATH) return { success: true, token: "aaa.bbb.ccc" };
          return { success: true, count: 0, results: [] };
        },
      }
    );
    assert.deepEqual(calls, [WS_TOKEN_PATH]);
    assert.equal(session.transport, "rest");
    assert.equal(session.host, "example.test");
    assert.equal(Object.hasOwn(session, "token"), false);
    assert.equal(Object.hasOwn(session, "socket"), false);
    assert.equal(JSON.stringify(session).includes("from-env"), false);
    assert.equal(JSON.stringify(session).includes("aaa.bbb.ccc"), false);
    const live = await session.getLiveEvents();
    assert.deepEqual(calls, [WS_TOKEN_PATH, "/tennis/v2/extend/api/events/live"]);
    assert.deepEqual(live.events, []);
    assert.throws(() => openProviderSocket({}), /provider socket is off/);
    assert.throws(
      () => openProviderSocket({ MATCHREAD_LIVE_SOCKET: "1" }),
      /handshake is not captured/
    );
  });

  it("refuses a token body that is not the captured shape", async () => {
    const calls = [];
    await assert.rejects(
      () =>
        connectLive({ RAPIDAPI_KEY: "from-env" }, {
          async get(path) {
            calls.push(path);
            return { accessToken: "nope" };
          },
        }),
      (error) => error.code === "WS_TOKEN_SHAPE"
    );
    assert.deepEqual(calls, [WS_TOKEN_PATH]);
  });

  it("sends the environment key to the captured token path", async () => {
    const original = globalThis.fetch;
    const seen = [];
    globalThis.fetch = async (url, init) => {
      seen.push({
        url: String(url),
        key: init.headers["X-RapidAPI-Key"],
        host: init.headers["X-RapidAPI-Host"],
      });
      return new Response(JSON.stringify({ success: true, token: "aaa.bbb.ccc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const session = await connectLive({
        RAPIDAPI_KEY: "from-env",
        RAPIDAPI_HOST: "example.test",
      });
      assert.equal(session.transport, "rest");
      assert.equal(session.host, "example.test");
      assert.equal(seen.length, 1);
      assert.equal(seen[0].url, `https://example.test${WS_TOKEN_PATH}`);
      assert.equal(seen[0].key, "from-env");
      assert.equal(seen[0].host, "example.test");
    } finally {
      globalThis.fetch = original;
    }
    const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
    assert.equal(source.includes("from-env"), false);
    assert.equal(source.includes("socket.io"), false);
    assert.equal(source.includes("new WebSocket"), false);
  });

  it("refreshes from exp at info and does not report an incident", async () => {
    const iat = 1_700_000_000;
    const exp = iat + 86400;
    const expired = token({ iat, exp });
    const fresh = token({ iat: exp, exp: exp + 86400 });
    const calls = [];
    let tokenReads = 0;
    const notes = [];
    const session = await connectLive(
      { RAPIDAPI_KEY: "from-env" },
      {
        async get(path) {
          calls.push(path);
          if (path === WS_TOKEN_PATH) {
            tokenReads += 1;
            if (tokenReads === 1) return { success: true, token: expired };
            return { success: true, token: fresh };
          }
          return { success: true, count: 0, results: [{ id: "1" }] };
        },
      },
      { info: (message) => notes.push(message) }
    );
    assert.equal(isTokenExpired(expired, exp * 1000 - 1000), false);
    assert.equal(isTokenExpired(expired, exp * 1000), true);
    assert.deepEqual(tokenExpiry(expired), { exp, iat });
    assert.equal(session.tokenAgeSec(iat * 1000 + 2044 * 1000), 2044);
    assert.equal(String(session.tokenAgeSec(iat * 1000)).includes(expired), false);
    assert.equal(await session.reconnect(exp * 1000 - 1000), false);
    assert.equal(tokenReads, 1);
    const live = await session.getLiveEvents(exp * 1000);
    assert.equal(live.events.length, 1);
    assert.deepEqual(notes, [TOKEN_EXPIRED]);
    assert.equal(notes.some((line) => line.includes(expired) || line.includes(fresh)), false);
    assert.equal(calls.filter((path) => path === WS_TOKEN_PATH).length, 2);
    assert.equal(calls.at(-1), "/tennis/v2/extend/api/events/live");
    const again = await session.getLiveEvents(exp * 1000 + 1000);
    assert.equal(again.events.length, 1);
    assert.deepEqual(notes, [TOKEN_EXPIRED]);
    assert.equal(tokenReads, 2);
  });

  it("logs the expiry on the info stream and clears a token before the next fetch", async () => {
    const exp = 1_700_086_400;
    const expired = token({ iat: exp - 86400, exp });
    const fresh = token({ iat: exp, exp: exp + 86400 });
    const notes = [];
    const original = console.info;
    const originalError = console.error;
    console.info = (message) => notes.push(message);
    console.error = (message) => {
      throw new Error(String(message));
    };
    let reads = 0;
    try {
      const session = await connectLive({ RAPIDAPI_KEY: "from-env" }, {
        async get(path) {
          if (path !== WS_TOKEN_PATH) return { success: true, count: 0, results: [] };
          reads += 1;
          if (reads === 1) return { success: true, token: expired };
          if (reads === 2) throw new Error("network");
          return { success: true, token: fresh };
        },
      });
      await assert.rejects(() => session.reconnect(exp * 1000), /network/);
      assert.deepEqual(notes, [TOKEN_EXPIRED]);
      const live = await session.getLiveEvents(exp * 1000);
      assert.deepEqual(live.events, []);
      assert.deepEqual(notes, [TOKEN_EXPIRED]);
      assert.equal(reads, 3);
    } finally {
      console.info = original;
      console.error = originalError;
    }
  });
});

describe("token exp", () => {
  it("leaves the proactive timer off and still refreshes at exp", async () => {
    assert.equal(proactiveRefreshEnabled(), false);
    assert.equal(proactiveRefreshEnabled({ MATCHREAD_LIVE_TOKEN_REFRESH: "1" }), false);
    const exp = 1_700_086_400;
    const current = token({ iat: exp - 86400, exp });
    const fresh = token({ iat: exp, exp: exp + 86400 });
    let reads = 0;
    const timers = [];
    const originalTimeout = globalThis.setTimeout;
    const originalInterval = globalThis.setInterval;
    globalThis.setTimeout = (...args) => {
      timers.push("timeout");
      return originalTimeout(...args);
    };
    globalThis.setInterval = (...args) => {
      timers.push("interval");
      return originalInterval(...args);
    };
    try {
      const notes = [];
      const session = await connectLive(
        { RAPIDAPI_KEY: "from-env", MATCHREAD_LIVE_TOKEN_REFRESH: "1" },
        {
          async get(path) {
            if (path !== WS_TOKEN_PATH) return { success: true, count: 0, results: [] };
            reads += 1;
            return { success: true, token: reads === 1 ? current : fresh };
          },
        },
        { info: (message) => notes.push(message) }
      );
      assert.equal(await session.reconnect(exp * 1000 - 1000), false);
      assert.equal(reads, 1);
      assert.equal(await session.reconnect(exp * 1000), true);
      assert.deepEqual(notes, [TOKEN_EXPIRED]);
      assert.equal(reads, 2);
      assert.deepEqual(timers, []);
    } finally {
      globalThis.setTimeout = originalTimeout;
      globalThis.setInterval = originalInterval;
    }
  });

  it("does not invent an expiry when exp is absent", () => {
    const bare = token({ iat: 1_700_000_000 });
    assert.equal(tokenExpiry(bare), null);
    assert.equal(isTokenExpired(bare, 2_000_000_000_000), false);
    assert.equal(isTokenExpired("not-a-token", 0), false);
  });

  it("close stops the next read", async () => {
    let reads = 0;
    const session = await connectLive(
      { RAPIDAPI_KEY: "from-env" },
      {
        async get(path) {
          reads += 1;
          if (path === WS_TOKEN_PATH) return { success: true, token: token({ exp: 9_999_999_999, iat: 1 }) };
          return { success: true, count: 0, results: [] };
        },
      }
    );
    session.close();
    await assert.rejects(
      () => session.getLiveEvents(Date.now()),
      (error) => error.name === "LISTENER_CLOSED"
    );
    assert.equal(reads, 1);
  });
});

describe("provider shutdown", () => {
  it("an abort during a retry wait does not send another request", async () => {
    const controller = new AbortController();
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    };
    try {
      const client = createClient({
        key: "from-env",
        host: "example.test",
        signal: controller.signal,
      });
      const pending = client.get("/tennis/v2/extend/api/events/live");
      setTimeout(() => controller.abort(), 20);
      await assert.rejects(pending, (error) => error.name === "LISTENER_CLOSED");
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
