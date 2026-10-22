/**
 * Provider listener. Connects, keeps changed raw frames, and posts that batch.
 * It does not parse scores, write tables, settle, or render.
 */
import { pathToFileURL } from "node:url";
import {
  HEARTBEAT_MS,
  connectLive,
  heartbeatDue,
  nextReconnectAttempt,
  nextWakeMs,
  reconnectDelayMs,
} from "@matchread/provider-rapidapi";
import { readFeedShape, recordedAbsences, removalEnabled } from "./feed-shape.ts";
import { forwardFrames, forwardHeartbeat } from "./forward.ts";
import { healthPort, startListenerHealth, type ListenerHealthState } from "./health.ts";
import { listenerInstanceId, railwayPollError } from "./instance.ts";
import { createListenerSession } from "./session.ts";
import { SHUTDOWN_HEARTBEAT_MS, createShutdown } from "./shutdown.ts";
import {
  carriedIdsFrom,
  lagMs,
  providerEventAt,
  tickCoverage,
  tickFlags,
  tickLine,
  unmappedCarriedFrom,
} from "./tick-log.ts";

type ListenerBeat = {
  connected: boolean;
  lastProviderEventAt: string | null;
  eventsReceived: number;
  mapped: number;
  unmapped: number;
  lagMs: number | null;
  tokenAgeS: number | null;
  instanceId: string;
};

type ListenerSession = ReturnType<typeof createListenerSession>;

type LiveSession = {
  tokenAgeSec: (now?: number) => number | null;
  getLiveEvents: (now?: number) => Promise<{ events?: unknown[] }>;
  close?: () => void;
};

type ConnectLive = (
  env: NodeJS.ProcessEnv,
  client: undefined,
  log: { info: (message: string) => void },
  options?: { signal?: AbortSignal }
) => Promise<LiveSession>;

export async function runOnce(options: {
  env: NodeJS.ProcessEnv;
  session: ListenerSession;
  connect?: ConnectLive;
  fetchImpl?: typeof fetch;
  now?: number;
  info?: (message: string) => void;
  live?: LiveSession;
  signal?: AbortSignal;
}): Promise<{
  received: number;
  changed: number;
  forwarded: number;
  requests: number;
  status: number | null;
  beat: ListenerBeat;
}> {
  const info = options.info ?? ((message: string) => console.info(message));
  const connect = options.connect ?? connectLive;
  const now = options.now ?? Date.now();
  const live = options.live ?? (await connect(options.env, undefined, { info }));
  const payload = await live.getLiveEvents(now);
  const frames = Array.isArray(payload.events) ? payload.events : [];
  const changed = options.session.takeChanged(frames);
  const feedShape = readFeedShape(options.env);
  const absent = recordedAbsences(feedShape, options.session.knownEventIds(), frames);
  if (options.session.recordUnprovenAbsence(absent) && absent.length > 0) {
    info(
      JSON.stringify({
        level: "info",
        name: "listener_absent",
        feedShape,
        removal: removalEnabled(feedShape),
        absent,
      })
    );
  }
  const instance = listenerInstanceId(options.env);
  const dryRun = options.env.LISTENER_DRY_RUN === "1";
  const ingestUrl = options.env.MATCHREAD_INGEST_URL?.trim() ?? "";
  const secret = options.env.INGEST_SECRET?.trim() ?? "";
  let status: number | null = null;
  let forwarded = 0;
  let requests = 0;
  let responseBody: unknown = null;
  try {
    if (options.signal?.aborted) throw closedError();
    if (changed.length && !dryRun) {
      if (!ingestUrl || !secret) {
        const error = new Error("MATCHREAD_INGEST_URL and INGEST_SECRET are required");
        error.name = "LISTENER_CONFIG";
        throw error;
      }
      const result = await forwardFrames(
        ingestUrl,
        secret,
        changed,
        instance,
        options.fetchImpl,
        options.signal
      );
      status = result.status;
      if (!result.ok) {
        const error = new Error(`ingest POST failed: ${result.status}`);
        error.name = "LISTENER_FORWARD";
        throw error;
      }
      options.session.noteCarried(carriedIdsFrom(result.body));
      responseBody = result.body;
      forwarded = changed.length;
      requests = 1;
    }
    options.session.commitLastTake();
  } catch (error) {
    options.session.releaseLastTake();
    throw error;
  }
  const coverage = tickCoverage(frames, new Set(options.session.carriedIds()));
  const flags = tickFlags(unmappedCarriedFrom(responseBody));
  info(
    tickLine({
      level: flags > 0 ? "warn" : "info",
      ts: new Date(now).toISOString(),
      job: "listener",
      conn: "up",
      events_in: coverage.events_in,
      mapped: coverage.mapped,
      unmapped: coverage.unmapped,
      changed: changed.length,
      posted: forwarded,
      flags,
      lag_ms: lagMs(frames, now),
      token_age_s: live.tokenAgeSec(now),
    })
  );
  return {
    received: frames.length,
    changed: changed.length,
    forwarded,
    requests,
    status,
    beat: {
      connected: true,
      lastProviderEventAt: providerEventAt(frames, now),
      eventsReceived: coverage.events_in,
      mapped: coverage.mapped,
      unmapped: coverage.unmapped,
      lagMs: lagMs(frames, now),
      tokenAgeS: live.tokenAgeSec(now),
      instanceId: instance,
    },
  };
}

export async function runListener(options: {
  env: NodeJS.ProcessEnv;
  connect?: ConnectLive;
  fetchImpl?: typeof fetch;
  info?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  once?: boolean;
  stopped?: () => boolean;
  signal?: AbortSignal;
  onCycle?: (cycle: { ok: boolean; at: number }) => void;
  random?: () => number;
  clock?: () => number;
}): Promise<void> {
  const poll = Number(options.env.LISTENER_POLL_MS);
  const once = options.once || !Number.isFinite(poll) || poll <= 0;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const info = options.info ?? ((message: string) => console.info(message));
  const clock = options.clock ?? Date.now;
  info(
    JSON.stringify({
      level: "info",
      name: "listener_start",
      instance: listenerInstanceId(options.env),
    })
  );
  const session = createListenerSession();
  const connect = options.connect ?? (connectLive as ConnectLive);
  const instance = listenerInstanceId(options.env);
  const shuttingDown = () => Boolean(options.stopped?.() || options.signal?.aborted);
  let live: LiveSession | null = null;
  let attempt = 0;
  let lastBeatAt: number | null = null;
  let nextReadAt = clock();
  let latest: ListenerBeat = {
    connected: false,
    lastProviderEventAt: null,
    eventsReceived: 0,
    mapped: 0,
    unmapped: 0,
    lagMs: null,
    tokenAgeS: null,
    instanceId: instance,
  };
  do {
    if (shuttingDown()) break;
    const now = clock();
    if (now >= nextReadAt) {
      try {
        if (!live) {
          live = await connect(options.env, undefined, { info }, { signal: options.signal });
        }
        if (shuttingDown()) break;
        const result = await runOnce({ ...options, session, now, live, signal: options.signal });
        latest = result.beat;
        options.onCycle?.({ ok: true, at: now });
        attempt = nextReconnectAttempt(attempt, true);
        nextReadAt = once ? Number.POSITIVE_INFINITY : now + poll;
      } catch (error) {
        closeLive(live);
        live = null;
        options.onCycle?.({ ok: false, at: clock() });
        if (shuttingDown()) break;
        if (once || permanentListenerError(error)) throw error;
        const failedAt = clock();
        const waitMs = reconnectDelayMs(attempt, options.random);
        latest = { ...latest, connected: false, tokenAgeS: null };
        info(
          tickLine({
            level: "info",
            ts: new Date(failedAt).toISOString(),
            job: "listener",
            conn: "down",
            events_in: 0,
            mapped: 0,
            unmapped: 0,
            changed: 0,
            posted: 0,
            flags: 0,
            lag_ms: null,
            token_age_s: null,
          })
        );
        attempt = nextReconnectAttempt(attempt, false);
        nextReadAt = failedAt + waitMs;
      }
    }
    const beatAt = clock();
    if (heartbeatDue(lastBeatAt, beatAt)) {
      lastBeatAt = beatAt;
      await postHeartbeat(options, latest, info);
    }
    if (once || shuttingDown()) break;
    const beatAnchor = lastBeatAt ?? beatAt;
    await sleep(nextWakeMs(clock(), nextReadAt, beatAnchor + HEARTBEAT_MS));
  } while (!shuttingDown());
  closeLive(live);
  if (!shuttingDown()) return;
  latest = { ...latest, connected: false, tokenAgeS: null };
  await postHeartbeat(options, latest, info, AbortSignal.timeout(SHUTDOWN_HEARTBEAT_MS));
}

function closeLive(live: LiveSession | null) {
  try {
    live?.close?.();
  } catch {
    /* A closed client must not keep the process up. */
  }
}

function closedError() {
  const error = new Error("listener shutting down");
  error.name = "LISTENER_CLOSED";
  return error;
}

async function postHeartbeat(
  options: {
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  },
  beat: ListenerBeat,
  info: (message: string) => void,
  signal?: AbortSignal
) {
  if (options.env.LISTENER_DRY_RUN === "1") return;
  const ingestUrl = options.env.MATCHREAD_INGEST_URL?.trim() ?? "";
  const secret = options.env.INGEST_SECRET?.trim() ?? "";
  if (!ingestUrl || !secret) return;
  try {
    const result = await forwardHeartbeat(ingestUrl, secret, beat, options.fetchImpl, signal);
    const stored =
      result.ok &&
      !!result.body &&
      typeof result.body === "object" &&
      (result.body as { heartbeat?: unknown }).heartbeat === true;
    if (!stored) {
      info(JSON.stringify({ level: "info", name: "listener_heartbeat", status: result.status }));
    }
  } catch {
    info(JSON.stringify({ level: "info", name: "listener_heartbeat", status: null }));
  }
}

function permanentListenerError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "LISTENER_CONFIG") return true;
  return "code" in error && error.code === "PROVIDER_KEY";
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invoked) {
  void startProcess();
}

async function startProcess() {
  const once = process.argv.includes("--once");
  const pollError = once ? null : railwayPollError(process.env);
  if (pollError) {
    console.error(pollError);
    process.exit(1);
  }
  const gate = createShutdown();
  const stopSignal = new AbortController();
  const health: ListenerHealthState = { draining: false, attempts: 0, lastSuccessAt: null };
  const release = once ? () => {} : gate.listen(() => {
    health.draining = true;
    stopSignal.abort();
  });
  const server = once ? null : await startListenerHealth(health, healthPort(process.env));
  let code = 0;
  try {
    await runListener({
      env: process.env,
      once,
      stopped: () => gate.requested(),
      signal: stopSignal.signal,
      sleep: once ? undefined : (ms) => gate.sleep(ms),
      onCycle: (cycle) => {
        health.attempts += 1;
        if (cycle.ok) health.lastSuccessAt = cycle.at;
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    code = 1;
  } finally {
    health.draining = true;
    release();
    await server?.close();
  }
  process.exit(code);
}
