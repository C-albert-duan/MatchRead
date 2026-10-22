import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseMatchId } from "./live.js";

/**
 * One NDJSON line for a raw provider response.
 * `body_text` must be the response body exactly as received.
 * Do not JSON.parse it before storing — key order and whitespace are evidence.
 *
 * @param {{
 *   captured_at: string,
 *   path: string,
 *   status: number,
 *   body_text: string,
 * }} record
 */
export function encodeCaptureLine(record) {
  return `${JSON.stringify({
    captured_at: record.captured_at,
    path: record.path,
    status: record.status,
    body_text: record.body_text,
  })}\n`;
}

function receivedAt() {
  return new Date().toISOString();
}

/**
 * Append-only NDJSON recorder. Re-opening the same path does not truncate.
 * Text stays text. Structured values are stored as JSON. Bytes are base64
 * with encoding "base64". No tennis fields are derived.
 *
 * @param {string} filePath
 */
export function createFrameRecorder(filePath) {
  /** @type {Promise<void>} */
  let chain = Promise.resolve();
  /** @type {import("node:fs").WriteStream | null} */
  let stream = null;
  let opened = false;
  let closed = false;

  async function open() {
    if (opened) return;
    await mkdir(dirname(filePath), { recursive: true });
    stream = createWriteStream(filePath, { flags: "a" });
    opened = true;
    await new Promise((resolve, reject) => {
      stream.once("ready", resolve);
      stream.once("error", reject);
    });
  }

  function writeLine(record) {
    if (closed) return Promise.reject(new Error("recorder closed"));
    const line = `${JSON.stringify(record)}\n`;
    const run = chain.then(async () => {
      await open();
      await new Promise((resolve, reject) => {
        stream.write(line, (err) => (err ? reject(err) : resolve()));
      });
    });
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  return {
    filePath,
    /** @param {{ transport?: string, path?: string, status?: number, payload: string }} frame */
    recordText(frame) {
      return writeLine({
        receivedAt: receivedAt(),
        transport: frame.transport || "http",
        encoding: "text",
        path: frame.path ?? null,
        status: frame.status ?? null,
        payload: frame.payload,
      });
    },
    /** @param {{ transport?: string, path?: string, status?: number, payload: unknown }} frame */
    recordJson(frame) {
      return writeLine({
        receivedAt: receivedAt(),
        transport: frame.transport || "socket",
        encoding: "json",
        path: frame.path ?? null,
        status: frame.status ?? null,
        payload: frame.payload,
      });
    },
    /**
     * @param {Uint8Array | Buffer} bytes
     * @param {{ transport?: string, path?: string }} [meta]
     */
    recordBinary(bytes, meta = {}) {
      return writeLine({
        receivedAt: receivedAt(),
        transport: meta.transport || "socket",
        encoding: "base64",
        path: meta.path ?? null,
        payload: Buffer.from(bytes).toString("base64"),
      });
    },
    /** @param {string} event @param {string | null} [detail] */
    lifecycle(event, detail = null) {
      return writeLine({
        receivedAt: receivedAt(),
        transport: "lifecycle",
        encoding: "text",
        event,
        detail,
      });
    },
    drained() {
      return chain;
    },
    async close() {
      await chain;
      if (closed) return;
      closed = true;
      if (!stream) return;
      await new Promise((resolve, reject) => {
        stream.end((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

/**
 * @param {ReturnType<typeof createFrameRecorder>} recorder
 * @param {NodeJS.Process} [proc]
 */
export function bindProcessSignals(recorder, proc = process) {
  const stop = (signal) => {
    proc.once(signal, () => {
      void (async () => {
        try {
          await recorder.lifecycle(signal);
          await recorder.close();
        } finally {
          proc.exit(0);
        }
      })();
    });
  };
  stop("SIGINT");
  stop("SIGTERM");
}

/**
 * Printed capture summary. Paths and sizes only — never the body or a secret.
 * @param {Array<Record<string, unknown>>} records
 */
export function captureReport(records) {
  const http = records.filter((row) => row.transport === "http");
  return {
    lines: records.length,
    http: http.map((row) => ({
      path: String(row.path || "").replace(/\/calendar\/\d+.*/, "/calendar/{year}"),
      status: row.status ?? null,
      bytes: typeof row.payload === "string" ? row.payload.length : 0,
    })),
  };
}

/** @param {string | null | undefined} text */
export function wtaTournamentIdFromLiveText(text) {
  if (!text) return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(body?.results)
      ? body.results
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.events)
          ? body.events
          : [];
  for (const row of rows) {
    if (String(row?.tourType || "").toLowerCase() !== "wta") continue;
    const parsed = parseMatchId(row?.matchId ?? row?.match_id);
    if (parsed?.tournamentId) return parsed.tournamentId;
  }
  return null;
}

/**
 * Record the REST live feed and the WTA companion calls.
 * `read` returns the provider body text. It must not perform product writes.
 *
 * @param {{
 *   recorder: ReturnType<typeof createFrameRecorder>,
 *   read: (path: string) => Promise<{ path?: string, status: number, bodyText: string }>,
 *   year: number | string,
 * }} session
 */
export async function runLiveCapture(session) {
  const { recorder, read, year } = session;
  let liveText = null;

  async function captureGet(path) {
    await recorder.lifecycle("connect", path);
    const once = async () => {
      const row = await read(path);
      if (path.startsWith("/tennis/v2/extend/api/events/live")) {
        liveText = row.bodyText;
      }
      await recorder.recordText({
        transport: "http",
        path: row.path || path,
        status: row.status,
        payload: row.bodyText,
      });
      if (row.status >= 400) throw new Error(`HTTP ${row.status}`);
    };
    try {
      await once();
      await recorder.lifecycle("received", path);
      return;
    } catch {
      await recorder.lifecycle("disconnect", path);
    }
    await recorder.lifecycle("reconnect", path);
    try {
      await once();
      await recorder.lifecycle("received", path);
    } catch {
      await recorder.lifecycle("disconnect", path);
    }
  }

  await recorder.lifecycle("start", "rest-live");
  await captureGet("/tennis/v2/extend/api/events/live");
  await recorder.drained();
  await captureGet("/tennis/v2/extend/api/ws-token");
  await captureGet(
    `/tennis/v2/wta/tournament/calendar/${year}?pageSize=2&pageNo=1`
  );

  const wtaId = wtaTournamentIdFromLiveText(liveText);
  await recorder.lifecycle(
    "wta-companion",
    wtaId ? `tournament ${wtaId}` : "no wta tournament id on the live feed"
  );
  if (wtaId) {
    const qs = new URLSearchParams({
      include: "round,tournament,tournament.court,tournament.country",
      filter: "PlayerGroup:singles",
      pageSize: "500",
    });
    await captureGet(`/tennis/v2/wta/fixtures/tournament/${wtaId}?${qs}`);
    await captureGet(`/tennis/v2/wta/tournament/results/${wtaId}`);
    await captureGet(`/tennis/v2/wta/tournament/info/${wtaId}`);
  }
  await recorder.lifecycle("end", null);
  await recorder.close();
}
