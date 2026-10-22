import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connectLive } from "@matchread/provider-rapidapi";
import { readFeedShape, recordedAbsences, removalEnabled } from "./feed-shape.ts";
import { forwardFrames, syncFactsUrl } from "./forward.ts";
import { listenerInstanceId, railwayPollError } from "./instance.ts";
import { runListener, runOnce } from "./main.ts";
import { createListenerSession, equalForIngest, frameSignature, providerEventId } from "./session.ts";
import { tournamentIdOf } from "./tick-log.ts";

describe("changed frames", () => {
  it("forwards a raw row once until a field changes", () => {
    const session = createListenerSession();
    const first = { id: "7000001", matchId: "101-202-9001-1", score: "1-0", points: "15-0" };
    const same = { points: "15-0", score: "1-0", matchId: "101-202-9001-1", id: "7000001" };
    assert.deepEqual(session.takeChanged([first]), [first]);
    assert.deepEqual(session.takeChanged([same]), []);
    const next = { ...first, score: "1-1" };
    assert.deepEqual(session.takeChanged([next]), [next]);
    assert.equal(equalForIngest(first, same), true);
    assert.equal(equalForIngest(first, next), false);
    assert.equal(frameSignature(first), frameSignature(same));
    assert.equal(providerEventId(first), "7000001");
  });

  it("returns a failed post to the next read", () => {
    const session = createListenerSession();
    const frame = { id: "7000001", matchId: "101-202-9001-1", score: "1-0" };
    assert.deepEqual(session.takeChanged([frame]), [frame]);
    session.releaseLastTake();
    assert.deepEqual(session.takeChanged([frame]), [frame]);
    session.commitLastTake();
    assert.deepEqual(session.takeChanged([frame]), []);
  });

  it("ignores a new receipt time and keeps state when a batch omits an id", () => {
    const session = createListenerSession();
    assert.deepEqual(session.takeChanged([{ matchId: "1-2-3-4", score: "0-0" }]), []);
    const held = { id: 12, score: "0-0", receivedAt: "2026-10-10T12:00:00.000Z" };
    const moved = {
      providerEventId: "9",
      score: "1-0",
      received_at: "2026-10-10T12:00:00.000Z",
      side: { score: "1-0" },
    };
    assert.equal(session.takeChanged([held, moved]).length, 2);
    assert.deepEqual(session.takeChanged([]), []);
    const again = {
      ...held,
      receivedAt: "2026-10-10T12:00:01.000Z",
      capturedAt: "2026-10-10T12:00:01.000Z",
    };
    const nested = {
      ...moved,
      received_at: "2026-10-10T12:00:02.000Z",
      side: { score: "1-0", receivedAt: "2026-10-10T12:00:02.000Z" },
    };
    assert.deepEqual(session.takeChanged([again, nested]), []);
    const changed = { ...again, score: "0-1" };
    assert.deepEqual(session.takeChanged([changed]), [changed]);
    assert.equal(equalForIngest(held, again), true);
    assert.equal(frameSignature(held), frameSignature(again));
    assert.deepEqual(session.knownEventIds(), ["12", "9"]);
  });
});

describe("feed shape", () => {
  it("leaves removal off and records a snapshot absence without a new row", async () => {
    assert.equal(readFeedShape({}), null);
    assert.equal(readFeedShape({ FEED_SHAPE: "full" }), null);
    assert.equal(readFeedShape({ FEED_SHAPE: " snapshot " }), "snapshot");
    assert.equal(readFeedShape({ FEED_SHAPE: "DELTA" }), "delta");
    assert.equal(removalEnabled(null), false);
    assert.equal(removalEnabled("snapshot"), false);
    assert.equal(removalEnabled("delta"), false);

    const session = createListenerSession();
    const kept = { id: "1", score: "1-0" };
    const other = { id: "2", score: "0-0" };
    assert.deepEqual(recordedAbsences(null, ["1", "2"], [kept]), []);
    assert.deepEqual(recordedAbsences("delta", ["1", "2"], [kept]), []);
    assert.deepEqual(session.takeChanged([kept, other]), [kept, other]);
    assert.deepEqual(session.takeChanged([kept]), []);
    assert.deepEqual(session.knownEventIds(), ["1", "2"]);
    assert.deepEqual(recordedAbsences("snapshot", session.knownEventIds(), [kept]), ["2"]);

    const notes: string[] = [];
    const posts: unknown[] = [];
    const env = {
      RAPIDAPI_KEY: "from-env",
      MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
      INGEST_SECRET: "ingest-secret",
      FEED_SHAPE: "snapshot",
    };
    const connect = async () => ({
      transport: "rest" as const,
      host: "example.test",
      reconnect: async () => false,
      tokenAgeSec: () => null,
      getLiveEvents: async () => ({ events: [kept], raw: null }),
    });
    const first = await runOnce({
      session,
      env,
      info: (message) => notes.push(message),
      connect,
      fetchImpl: async () => {
        throw new Error("unchanged row was forwarded");
      },
    });
    assert.equal(first.forwarded, 0);
    const absent = notes.filter((line) => line.includes("listener_absent")).map((line) => JSON.parse(line));
    assert.equal(absent.length, 1);
    assert.deepEqual(absent[0].absent, ["2"]);
    assert.equal(absent[0].removal, false);
    assert.equal(JSON.stringify(absent[0]).includes("completed"), false);
    assert.equal(JSON.stringify(absent[0]).includes("suspended"), false);
    const second = await runOnce({
      session,
      env,
      info: (message) => notes.push(message),
      connect,
      fetchImpl: async (_url, init) => {
        posts.push(JSON.parse(String(init?.body)));
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(second.forwarded, 0);
    assert.equal(notes.filter((line) => line.includes("listener_absent")).length, 1);
    assert.deepEqual(posts, []);
  });
});

describe("ingest forward", () => {
  it("posts the raw batch to sync-facts", async () => {
    assert.equal(
      syncFactsUrl("https://example.test/functions/v1/ingest-events"),
      "https://example.test/functions/v1/sync-facts"
    );
    const frames = [{ id: "1", score: "6-4" }];
    const seen: { url: string; init: RequestInit | undefined } = { url: "", init: undefined };
    const result = await forwardFrames(
      "https://example.test/functions/v1/ingest-events/",
      "ingest-secret",
      frames,
      "replica-a",
      async (url, init) => {
        seen.url = String(url);
        seen.init = init;
        return new Response("{}", { status: 200 });
      }
    );
    assert.equal(result.ok, true);
    assert.equal(seen.url, "https://example.test/functions/v1/sync-facts");
    assert.equal(seen.init?.method, "POST");
    const headers = seen.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer ingest-secret");
    assert.deepEqual(JSON.parse(String(seen.init?.body)), {
      mode: "live",
      liveFrames: frames,
      listenerInstanceId: "replica-a",
    });
  });

  it("posts one request for every changed match in the tick", async () => {
    const calls: Array<{ url: string; authorization: string; liveFrames: unknown[] }> = [];
    const tick = [
      { id: "1", matchId: "10-20-900-1", score: "1-0" },
      { id: "2", matchId: "11-21-901-1", score: "0-0" },
      { id: "3", matchId: "12-22-900-2", score: "6-4" },
    ];
    const result = await runOnce({
      session: createListenerSession(),
      env: {
        RAPIDAPI_KEY: "from-env",
        MATCHREAD_INGEST_URL: "https://example.test/functions/v1/ingest-events",
        INGEST_SECRET: "ingest-secret",
      },
      info: () => {},
      connect: async () => ({
        transport: "rest",
        host: "example.test",
        reconnect: async () => false,
      tokenAgeSec: () => null,
        getLiveEvents: async () => ({ events: tick, raw: null }),
      }),
      fetchImpl: async (url, init) => {
        const headers = init?.headers as Record<string, string>;
        calls.push({
          url: String(url),
          authorization: headers.Authorization,
          liveFrames: JSON.parse(String(init?.body)).liveFrames,
        });
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(result.requests, 1);
    assert.equal(result.forwarded, 3);
    assert.equal(calls[0]?.url, "https://example.test/functions/v1/sync-facts");
    assert.equal(calls[0]?.authorization, "Bearer ingest-secret");
    assert.deepEqual(calls[0]?.liveFrames, tick);
  });
});

describe("duplicate event", () => {
  it("posts an exact replay once", async () => {
    const event = {
      id: "evt-1",
      matchId: "1-2-900-1",
      status: "InPlay",
      score: "1-0",
      points: "15-0",
      updatedAt: 1_700_000_000_000,
    };
    const replay = JSON.parse(JSON.stringify(event)) as typeof event;
    const session = createListenerSession();
    const env = {
      RAPIDAPI_KEY: "from-env",
      MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
      INGEST_SECRET: "ingest-secret",
    };
    const posts: Array<{ liveFrames?: unknown[] }> = [];
    const connect = async () => ({
      transport: "rest" as const,
      host: "example.test",
      reconnect: async () => false,
      tokenAgeSec: () => null,
      getLiveEvents: async () => ({ events: [replay], raw: null }),
    });
    const first = await runOnce({
      session,
      env,
      info: () => {},
      connect,
      fetchImpl: async (_url, init) => {
        posts.push(JSON.parse(String(init?.body)));
        return new Response("{}", { status: 200 });
      },
    });
    const second = await runOnce({
      session,
      env,
      info: () => {},
      connect: async () => ({
        transport: "rest" as const,
        host: "example.test",
        reconnect: async () => false,
        tokenAgeSec: () => null,
        getLiveEvents: async () => ({ events: [JSON.parse(JSON.stringify(event))], raw: null }),
      }),
      fetchImpl: async () => {
        throw new Error("exact replay was forwarded");
      },
    });
    assert.equal(first.forwarded, 1);
    assert.equal(second.changed, 0);
    assert.equal(second.forwarded, 0);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0]?.liveFrames, [event]);
  });
});

describe("listener restart", () => {
  it("posts the next snapshot once after the comparison cache is gone", async () => {
    const snapshot = [
      { id: "fx-1", matchId: "1-2-900-1", status: "InPlay", score: "1-0", points: "0-0", updatedAt: 1_700_000_000_000 },
      { id: "fx-2", matchId: "3-4-900-1", status: "InPlay", score: "2-1", points: "15-0", updatedAt: 1_700_000_060_000 },
      { id: "fx-3", matchId: "5-6-900-1", status: "InPlay", score: "6-4,3-3", points: "30-0", updatedAt: 1_700_000_120_000 },
    ];
    const env = {
      RAPIDAPI_KEY: "from-env",
      MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
      INGEST_SECRET: "ingest-secret",
    };
    const posts: Array<{ mode?: string; liveFrames?: unknown[] }> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ carriedProviderIds: ["900"] }), { status: 200 });
    };
    const connect = async () => ({
      transport: "rest" as const,
      host: "example.test",
      reconnect: async () => false,
      tokenAgeSec: () => null,
      getLiveEvents: async () => ({ events: snapshot.map((row) => JSON.parse(JSON.stringify(row))), raw: null }),
    });

    const warm = createListenerSession();
    const first = await runOnce({ session: warm, env, info: () => {}, connect, fetchImpl });
    const quiet = await runOnce({ session: warm, env, info: () => {}, connect, fetchImpl });
    assert.equal(first.forwarded, 3);
    assert.equal(first.requests, 1);
    assert.equal(quiet.changed, 0);
    assert.equal(quiet.forwarded, 0);

    const restarted = createListenerSession();
    const again = await runOnce({ session: restarted, env, info: () => {}, connect, fetchImpl });
    assert.equal(again.received, 3);
    assert.equal(again.changed, 3);
    assert.equal(again.forwarded, 3);
    assert.equal(again.requests, 1);
    assert.equal(posts.length, 2);
    assert.equal(posts[0]?.mode, "live");
    assert.equal(posts[1]?.mode, "live");
    assert.deepEqual(posts[0]?.liveFrames, snapshot);
    assert.deepEqual(posts[1]?.liveFrames, snapshot);
  });
});

describe("listener cycle", () => {
  it("connects, forwards only the change, and logs one tick line", async () => {
    const notes: string[] = [];
    const posts: unknown[] = [];
    const session = createListenerSession();
    const first = await runOnce({
      session,
      env: {
        RAPIDAPI_KEY: "from-env",
        MATCHREAD_INGEST_URL: "https://example.test/functions/v1/ingest-events",
        INGEST_SECRET: "ingest-secret",
      },
      info: (message) => notes.push(message),
      connect: async () => ({
        transport: "rest",
        host: "example.test",
        reconnect: async () => false,
      tokenAgeSec: () => null,
        getLiveEvents: async () => ({
          events: [{ id: "1", score: "1-0", player1: { name: "Alpha" } }],
          raw: null,
        }),
      }),
      fetchImpl: async (_url, init) => {
        posts.push(JSON.parse(String(init?.body)));
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(first.forwarded, 1);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0], {
      mode: "live",
      liveFrames: [{ id: "1", score: "1-0", player1: { name: "Alpha" } }],
      listenerInstanceId: listenerInstanceId({
        RAPIDAPI_KEY: "from-env",
        MATCHREAD_INGEST_URL: "https://example.test/functions/v1/ingest-events",
        INGEST_SECRET: "ingest-secret",
      }),
    });
    const beat = JSON.parse(notes.at(-1) ?? "{}");
    assert.equal(beat.job, "listener");
    assert.equal(beat.conn, "up");
    assert.equal(beat.level, "info");
    assert.equal(beat.events_in, 1);
    assert.equal(beat.posted, 1);
    assert.equal(beat.flags, 0);
    assert.equal(JSON.stringify(beat).includes("Alpha"), false);
    assert.equal(JSON.stringify(beat).includes("from-env"), false);
    const second = await runOnce({
      session,
      env: {
        RAPIDAPI_KEY: "from-env",
        MATCHREAD_INGEST_URL: "https://example.test/functions/v1/ingest-events",
        INGEST_SECRET: "ingest-secret",
      },
      info: (message) => notes.push(message),
      connect: async () => ({
        transport: "rest",
        host: "example.test",
        reconnect: async () => false,
      tokenAgeSec: () => null,
        getLiveEvents: async () => ({
          events: [{ id: "1", score: "1-0", player1: { name: "Alpha" } }],
          raw: null,
        }),
      }),
      fetchImpl: async () => {
        throw new Error("unchanged frame was forwarded");
      },
    });
    assert.equal(second.changed, 0);
    assert.equal(second.forwarded, 0);
  });

  it("posts the same raw row from two replicas", async () => {
    const posts: Array<{ listenerInstanceId?: string; liveFrames?: unknown[] }> = [];
    const frame = { id: "1", score: "1-0" };
    const base = {
      RAPIDAPI_KEY: "from-env",
      MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
      INGEST_SECRET: "ingest-secret",
    };
    for (const replica of ["replica-a", "replica-b"]) {
      await runOnce({
        session: createListenerSession(),
        env: { ...base, RAILWAY_REPLICA_ID: replica },
        info: () => {},
        connect: async () => ({
          transport: "rest",
          host: "example.test",
          reconnect: async () => false,
      tokenAgeSec: () => null,
          getLiveEvents: async () => ({ events: [frame], raw: null }),
        }),
        fetchImpl: async (_url, init) => {
          posts.push(JSON.parse(String(init?.body)));
          return new Response("{}", { status: 200 });
        },
      });
    }
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[0]?.liveFrames, [frame]);
    assert.deepEqual(posts[1]?.liveFrames, [frame]);
    assert.equal(posts[0]?.listenerInstanceId, "replica-a");
    assert.equal(posts[1]?.listenerInstanceId, "replica-b");
    assert.equal(listenerInstanceId({ RAILWAY_REPLICA_ID: "replica-b" }), "replica-b");
    assert.equal(railwayPollError({ RAILWAY_SERVICE_ID: "svc" }), "LISTENER_POLL_MS is required on Railway");
    assert.equal(railwayPollError({ RAILWAY_SERVICE_ID: "svc", LISTENER_POLL_MS: "5000" }), null);
    assert.equal(railwayPollError({}), null);
  });
});

describe("tick log", () => {
  it("reads seasonId or the match id segment and ignores player names", () => {
    assert.equal(
      tournamentIdOf({ seasonId: "900", matchId: "1-2-900-1", player1: { name: "Alpha" } }),
      "900"
    );
    assert.equal(tournamentIdOf({ matchId: "1-2-900-1", player1: { name: "Alpha" } }), "900");
    assert.equal(
      tournamentIdOf({ seasonId: "900", matchId: "1-2-901-1", player1: { name: "Alpha" } }),
      null
    );
    assert.equal(tournamentIdOf({ player1: { name: "Alpha" }, player2: { name: "Beta" } }), null);
    assert.equal(tournamentIdOf({ seasonId: "Challenger Event" }), null);
  });

  it("keeps a foreign feed quiet and warns when a carried event does not map", async () => {
    const notes: string[] = [];
    const session = createListenerSession();
    const now = 1_700_000_310_000;
    const env = {
      RAPIDAPI_KEY: "from-env",
      MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
      INGEST_SECRET: "ingest-secret",
    };
    const carried = { id: "c", matchId: "1-2-900-1", updatedAt: now - 310, score: "1-0" };
    const other = { id: "u", matchId: "3-4-901-1", updatedAt: now - 800, score: "0-0" };
    const live = (events: unknown[]) =>
      async () => ({
        transport: "rest" as const,
        host: "example.test",
        reconnect: async () => false,
        tokenAgeSec: () => 2044,
        getLiveEvents: async () => ({ events, raw: null }),
      });

    await runOnce({
      session,
      env,
      now,
      info: (message) => notes.push(message),
      connect: live([carried, other, { ...other, id: "u2" }]),
      fetchImpl: async () => new Response(JSON.stringify({ carriedProviderIds: ["900"] }), { status: 200 }),
    });
    const first = JSON.parse(notes.at(-1) ?? "{}");
    assert.equal(first.ts, new Date(now).toISOString());
    assert.equal(first.job, "listener");
    assert.equal(first.conn, "up");
    assert.equal(first.events_in, 3);
    assert.equal(first.mapped, 1);
    assert.equal(first.unmapped, 2);
    assert.equal(first.changed, 3);
    assert.equal(first.posted, 3);
    assert.equal(first.flags, 0);
    assert.equal(first.level, "info");
    assert.equal(first.lag_ms, 310);
    assert.equal(first.token_age_s, 2044);

    await runOnce({
      session,
      env,
      now,
      info: (message) => notes.push(message),
      connect: live([{ id: "u", matchId: "3-4-901-1", updatedAt: now, score: "1-0" }]),
      fetchImpl: async () => new Response(JSON.stringify({ carriedProviderIds: [] }), { status: 200 }),
    });
    const foreign = JSON.parse(notes.at(-1) ?? "{}");
    assert.equal(foreign.events_in, 1);
    assert.equal(foreign.mapped, 0);
    assert.equal(foreign.unmapped, 1);
    assert.equal(foreign.flags, 0);
    assert.equal(foreign.level, "info");
    assert.equal(foreign.posted, 1);

    await runOnce({
      session,
      env,
      now,
      info: (message) => notes.push(message),
      connect: live([{ ...carried, score: "1-1" }]),
      fetchImpl: async () =>
        new Response(JSON.stringify({ carriedProviderIds: ["900"], unmappedCarried: 1 }), {
          status: 200,
        }),
    });
    const alarm = JSON.parse(notes.at(-1) ?? "{}");
    assert.equal(alarm.mapped, 1);
    assert.equal(alarm.unmapped, 0);
    assert.equal(alarm.flags, 1);
    assert.equal(alarm.level, "warn");

    const many = Array.from({ length: 29 }, (_, index) => ({
      id: `o${index}`,
      matchId: `3-4-901-${index + 1}`,
      score: "0-0",
      updatedAt: now,
    }));
    await runOnce({
      session,
      env,
      now,
      info: (message) => notes.push(message),
      connect: live([carried, ...many]),
      fetchImpl: async () => new Response("{}", { status: 200 }),
    });
    const quiet = JSON.parse(notes.at(-1) ?? "{}");
    assert.equal(quiet.events_in, 30);
    assert.equal(quiet.mapped, 1);
    assert.equal(quiet.unmapped, 29);
    assert.equal(quiet.flags, 0);
    assert.equal(quiet.level, "info");
  });
});

describe("heartbeat", () => {
  it("posts the latest tick about every 30 seconds and does not read again early", async () => {
    const bodies: Array<{ liveFrames?: unknown[]; listenerHeartbeat?: Record<string, unknown> }> = [];
    let connects = 0;
    let now = 1_700_000_000_000;
    const sleeps: number[] = [];
    await assert.rejects(
      () =>
        runListener({
          env: {
            RAPIDAPI_KEY: "from-env",
            MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
            INGEST_SECRET: "ingest-secret",
            LISTENER_POLL_MS: "60000",
          },
          clock: () => now,
          info: () => {},
          connect: async () => {
            connects += 1;
            return {
              transport: "rest" as const,
              host: "example.test",
              reconnect: async () => false,
              tokenAgeSec: () => 2044,
              getLiveEvents: async () => ({
                events: [{ id: "1", matchId: "1-2-900-1", updatedAt: now - 310, score: "1-0" }],
                raw: null,
              }),
            };
          },
          fetchImpl: async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body)));
            return new Response(JSON.stringify({ carriedProviderIds: ["900"], heartbeat: true }), {
              status: 200,
            });
          },
          sleep: async (ms) => {
            sleeps.push(ms);
            now += ms;
            const beats = bodies.filter((body) => body.listenerHeartbeat);
            if (beats.length >= 2) throw new Error("stop");
          },
        }),
      /stop/
    );
    assert.equal(connects, 1);
    assert.equal(sleeps[0], 30_000);
    assert.equal(bodies[0]?.liveFrames?.length, 1);
    const beats = bodies.filter((body) => body.listenerHeartbeat);
    assert.equal(beats.length, 2);
    assert.equal(beats[0]?.listenerHeartbeat?.connected, true);
    assert.equal(beats[0]?.listenerHeartbeat?.eventsReceived, 1);
    assert.equal(beats[0]?.listenerHeartbeat?.mapped, 1);
    assert.equal(beats[0]?.listenerHeartbeat?.unmapped, 0);
    assert.equal(beats[0]?.listenerHeartbeat?.lagMs, 310);
    assert.equal(beats[0]?.listenerHeartbeat?.tokenAgeS, 2044);
    assert.equal(JSON.stringify(beats).includes("from-env"), false);
    assert.equal(JSON.stringify(beats).includes("ingest-secret"), false);
  });

  it("records a down heartbeat without the provider error text", async () => {
    const bodies: Array<{ listenerHeartbeat?: { connected?: boolean } }> = [];
    await assert.rejects(
      () =>
        runListener({
          env: {
            RAPIDAPI_KEY: "from-env",
            MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
            INGEST_SECRET: "ingest-secret",
            LISTENER_POLL_MS: "60000",
          },
          info: () => {},
          connect: async () => {
            throw new Error("provider down from-env");
          },
          fetchImpl: async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body)));
            return new Response(JSON.stringify({ heartbeat: true }), { status: 200 });
          },
          sleep: async () => {
            throw new Error("stop");
          },
        }),
      /stop/
    );
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]?.listenerHeartbeat?.connected, false);
    assert.equal(JSON.stringify(bodies).includes("from-env"), false);
    assert.equal(JSON.stringify(bodies).includes("provider down"), false);
  });
});

describe("token expiry", () => {
  it("clears an expired token during a match, reconnects, and keeps the score", async () => {
    const iat = 1_700_000_000;
    const exp = iat + 86_400;
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const expired = `${header}.${Buffer.from(JSON.stringify({ iat, exp })).toString("base64url")}.sig`;
    const fresh = `${header}.${Buffer.from(JSON.stringify({ iat: exp, exp: exp + 86_400 })).toString("base64url")}.sig`;
    let tokenReads = 0;
    let liveReads = 0;
    let now = (exp - 10) * 1000;
    const notes: string[] = [];
    const bodies: Array<{ liveFrames?: Array<{ id?: string; score?: string }> }> = [];
    const laterAt = exp * 1000 + 5_000;

    await assert.rejects(
      () =>
        runListener({
          env: {
            RAPIDAPI_KEY: "from-env",
            MATCHREAD_INGEST_URL: "https://example.test/functions/v1/sync-facts",
            INGEST_SECRET: "ingest-secret",
            LISTENER_POLL_MS: "20000",
          },
          clock: () => now,
          info: (message) => notes.push(message),
          connect: (env, _client, log) =>
            connectLive(
              env,
              {
                async get(path) {
                  if (String(path).includes("ws-token")) {
                    tokenReads += 1;
                    return { success: true, token: tokenReads === 1 ? expired : fresh };
                  }
                  liveReads += 1;
                  return {
                    success: true,
                    count: 1,
                    results: [
                      {
                        id: "match-1",
                        matchId: "1-2-900-1",
                        status: "InPlay",
                        score: liveReads === 1 ? "1-0" : "2-0",
                        updatedAt: liveReads === 1 ? now - 500 : laterAt,
                      },
                    ],
                  };
                },
              },
              log
            ),
          fetchImpl: async (_url, init) => {
            bodies.push(JSON.parse(String(init?.body ?? "{}")));
            return new Response(JSON.stringify({ carriedProviderIds: ["900"] }), { status: 200 });
          },
          sleep: async (ms) => {
            now += ms;
            if (liveReads >= 3) throw new Error("stop");
          },
        }),
      /stop/
    );

    assert.equal(tokenReads, 2);
    assert.equal(liveReads, 3);
    const posts = bodies.filter((body) => (body.liveFrames?.length ?? 0) > 0);
    assert.equal(posts.length, 2);
    assert.equal(posts[0]?.liveFrames?.[0]?.id, "match-1");
    assert.equal(posts[0]?.liveFrames?.[0]?.score, "1-0");
    assert.equal(posts[1]?.liveFrames?.[0]?.id, "match-1");
    assert.equal(posts[1]?.liveFrames?.[0]?.score, "2-0");
    const expiry = notes
      .map((line) => {
        try {
          return JSON.parse(line) as { level?: string; name?: string };
        } catch {
          return null;
        }
      })
      .filter((line) => line?.name === "token_expired");
    assert.equal(expiry.length, 1);
    assert.equal(expiry[0]?.level, "info");
    const ticks = notes
      .filter((line) => line.includes('"job":"listener"'))
      .map((line) => JSON.parse(line) as { conn: string });
    assert.equal(ticks.length, 3);
    assert.equal(ticks.every((tick) => tick.conn === "up"), true);
    const dumped = JSON.stringify({ notes, bodies });
    assert.equal(dumped.includes(expired), false);
    assert.equal(dumped.includes(fresh), false);
    assert.equal(dumped.includes("winner_player_id"), false);
    assert.equal(dumped.includes("official_score"), false);
  });
});

describe("reconnect", () => {
  it("waits on the schedule and starts again after a stable read", async () => {
    const sleeps: number[] = [];
    const notes: string[] = [];
    let calls = 0;
    let now = 1_000_000;
    await assert.rejects(
      () =>
        runListener({
          env: {
            RAPIDAPI_KEY: "from-env",
            LISTENER_POLL_MS: "5000",
            LISTENER_DRY_RUN: "1",
          },
          info: (message) => notes.push(message),
          random: () => 0.5,
          clock: () => now,
          connect: async () => {
            calls += 1;
            if (calls === 1 || calls >= 3) throw new Error("provider down");
            let reads = 0;
            return {
              transport: "rest",
              host: "example.test",
              reconnect: async () => false,
              tokenAgeSec: () => null,
              getLiveEvents: async () => {
                reads += 1;
                if (reads > 1) throw new Error("provider down");
                return { events: [], raw: null };
              },
            };
          },
          sleep: async (ms) => {
            sleeps.push(ms);
            now += ms;
            if (sleeps.length >= 4) throw new Error("stop");
          },
        }),
      /stop/
    );
    assert.deepEqual(sleeps, [1_000, 5_000, 1_000, 2_000]);
    const down = notes
      .filter((line) => line.includes('"conn":"down"'))
      .map((line) => JSON.parse(line) as { job: string; conn: string; events_in: number; flags: number });
    assert.equal(down.length, 3);
    assert.equal(down[0]?.job, "listener");
    assert.equal(down[0]?.events_in, 0);
    assert.equal(down[0]?.flags, 0);
    assert.equal(notes.some((line) => line.includes("listener_reconnect")), false);
  });

  it("does not retry a missing ingest target", async () => {
    const sleeps: number[] = [];
    await assert.rejects(
      () =>
        runListener({
          env: { RAPIDAPI_KEY: "from-env", LISTENER_POLL_MS: "5000" },
          info: () => {},
          connect: async () => ({
            transport: "rest",
            host: "example.test",
            reconnect: async () => false,
      tokenAgeSec: () => null,
            getLiveEvents: async () => ({ events: [{ id: "1", score: "1-0" }], raw: null }),
          }),
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        }),
      (error: unknown) => error instanceof Error && error.name === "LISTENER_CONFIG"
    );
    assert.deepEqual(sleeps, []);
  });
});
