import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  bindProcessSignals,
  captureReport,
  createClient,
  createFrameRecorder,
  encodeCaptureLine,
  runLiveCapture,
} from "./index.js";

async function tempFile(name = "frames.ndjson") {
  const dir = await mkdtemp(join(tmpdir(), "mr-capture-"));
  return { dir, file: join(dir, name) };
}

async function linesOf(file) {
  const text = await readFile(file, "utf8");
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

describe("raw NDJSON capture", () => {
  it("stores the response body text without re-serializing it", () => {
    const body = '{"b":1, "a": 2}\n';
    const line = encodeCaptureLine({
      captured_at: "2026-08-12T02:30:00.000Z",
      path: "/tennis/v2/atp/tournament/calendar/2026",
      status: 200,
      body_text: body,
    });
    const parsed = JSON.parse(line);
    assert.equal(parsed.body_text, body);
    assert.equal(line.endsWith("\n"), true);
  });

  it("reports the exact body from the client before JSON.parse", async () => {
    const body = '{"z":1, "a": 2}';
    const seen = [];
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    });
    try {
      const client = createClient({
        key: "test-key",
        onRawBody: (row) => seen.push(row),
      });
      const parsed = await client.get("/tennis/v2/atp/ranking/singles");
      assert.deepEqual(parsed, { z: 1, a: 2 });
      assert.equal(seen.length, 1);
      assert.equal(seen[0].bodyText, body);
      assert.equal(seen[0].status, 200);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("frame recorder", () => {
  it("one frame creates one NDJSON entry", async () => {
    const { file } = await tempFile();
    const recorder = createFrameRecorder(file);
    await recorder.recordText({ path: "/live", status: 200, payload: "frame-1" });
    await recorder.close();
    const rows = await linesOf(file);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payload, "frame-1");
  });

  it("receivedAt exists on every frame", async () => {
    const { file } = await tempFile();
    const recorder = createFrameRecorder(file);
    await recorder.recordText({ path: "/live", status: 200, payload: "frame-1" });
    await recorder.close();
    const [row] = await linesOf(file);
    assert.match(row.receivedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("multiple frames append rather than overwrite", async () => {
    const { file } = await tempFile();
    const recorder = createFrameRecorder(file);
    await recorder.recordText({ path: "/live", status: 200, payload: "one" });
    await recorder.recordText({ path: "/live", status: 200, payload: "two" });
    await recorder.close();
    const rows = await linesOf(file);
    assert.deepEqual(
      rows.map((row) => row.payload),
      ["one", "two"]
    );
  });

  it("payload content survives unchanged", async () => {
    const { file } = await tempFile();
    const recorder = createFrameRecorder(file);
    const text = '{"b":1, "a": 2}\n';
    await recorder.recordText({ path: "/live", status: 200, payload: text });
    await recorder.recordJson({
      payload: { unexpected: "keep", nested: { a: 1 } },
    });
    await recorder.recordBinary(Uint8Array.from([0, 255, 10]));
    await recorder.close();
    const rows = await linesOf(file);
    assert.equal(rows[0].payload, text);
    assert.deepEqual(rows[1].payload, { unexpected: "keep", nested: { a: 1 } });
    assert.equal(rows[2].encoding, "base64");
    assert.deepEqual([...Buffer.from(rows[2].payload, "base64")], [0, 255, 10]);
  });

  it("creates the output directory", async () => {
    const { dir } = await tempFile();
    const file = join(dir, "nested", "deeper", "frames.ndjson");
    const recorder = createFrameRecorder(file);
    await recorder.recordText({ path: "/live", status: 200, payload: "x" });
    await recorder.close();
    await access(join(dir, "nested", "deeper"));
    assert.equal((await linesOf(file))[0].payload, "x");
  });

  it("reconnect does not truncate previous frames", async () => {
    const { file } = await tempFile();
    const first = createFrameRecorder(file);
    await first.recordText({ path: "/live", status: 200, payload: "kept" });
    await first.lifecycle("disconnect", "/live");
    await first.close();

    const second = createFrameRecorder(file);
    await second.lifecycle("reconnect", "/live");
    await second.recordText({ path: "/live", status: 200, payload: "after" });
    await second.close();

    const rows = await linesOf(file);
    assert.equal(rows[0].payload, "kept");
    assert.equal(rows[1].event, "disconnect");
    assert.equal(rows[2].event, "reconnect");
    assert.equal(rows[3].payload, "after");
  });

  it("graceful termination closes the file safely", async () => {
    const { file } = await tempFile();
    const recorder = createFrameRecorder(file);
    await recorder.recordText({ path: "/live", status: 200, payload: "before-stop" });
    const proc = new EventEmitter();
    proc.once = (signal, fn) => {
      proc.on(signal, fn);
      return proc;
    };
    let code = null;
    bindProcessSignals(recorder, proc);
    await new Promise((resolve) => {
      proc.exit = (status) => {
        code = status;
        resolve();
      };
      proc.emit("SIGTERM");
    });
    const text = await readFile(file, "utf8");
    assert.equal(text.endsWith("\n"), true);
    const rows = text.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(rows[0].payload, "before-stop");
    assert.equal(rows.at(-1).event, "SIGTERM");
    assert.equal(code, 0);
    await assert.rejects(
      () => recorder.recordText({ path: "/live", status: 200, payload: "after-close" }),
      /recorder closed/
    );
  });
});

describe("capture script", () => {
  it("records the WTA companion from a fake live body and omits secrets from the report", async () => {
    const { file } = await tempFile();
    const recorder = createFrameRecorder(file);
    const apiKey = "rk_live_should_not_leak";
    const token = "ws_token_should_not_print";
    const seen = [];
    await runLiveCapture({
      recorder,
      year: 2026,
      read: async (path) => {
        seen.push(path);
        if (path.startsWith("/tennis/v2/extend/api/events/live")) {
          return {
            path,
            status: 200,
            bodyText: JSON.stringify({
              results: [{ tourType: "wta", matchId: "11-22-99-4" }],
            }),
          };
        }
        if (path.startsWith("/tennis/v2/extend/api/ws-token")) {
          return {
            path,
            status: 200,
            bodyText: JSON.stringify({ success: true, token }),
          };
        }
        return { path, status: 200, bodyText: "{}" };
      },
    });

    assert.ok(seen.some((path) => path.includes("/tennis/v2/wta/tournament/calendar/2026")));
    assert.ok(seen.some((path) => path.includes("/tennis/v2/wta/fixtures/tournament/99")));
    assert.ok(seen.some((path) => path.includes("/tennis/v2/wta/tournament/results/99")));
    assert.ok(seen.some((path) => path.includes("/tennis/v2/wta/tournament/info/99")));

    const text = await readFile(file, "utf8");
    assert.equal(text.includes(apiKey), false);
    assert.equal(text.includes(token), true);
    const report = JSON.stringify(
      captureReport(text.trim().split("\n").map((line) => JSON.parse(line)))
    );
    assert.equal(report.includes(apiKey), false);
    assert.equal(report.includes(token), false);
    assert.equal(report.includes("bodyText"), false);
  });

  it("a failed read reconnects without dropping the frames already stored", async () => {
    const { file } = await tempFile();
    const recorder = createFrameRecorder(file);
    let liveTries = 0;
    await runLiveCapture({
      recorder,
      year: 2026,
      read: async (path) => {
        if (path.startsWith("/tennis/v2/extend/api/events/live")) {
          liveTries += 1;
          if (liveTries === 1) throw new Error("reset");
          return { path, status: 200, bodyText: "LIVE-BODY" };
        }
        return { path, status: 200, bodyText: "{}" };
      },
    });
    const rows = await linesOf(file);
    assert.equal(rows.some((row) => row.event === "start"), true);
    assert.equal(rows.some((row) => row.event === "reconnect"), true);
    assert.equal(rows.some((row) => row.payload === "LIVE-BODY"), true);
  });
});
