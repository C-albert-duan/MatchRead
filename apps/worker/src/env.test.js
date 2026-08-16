import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ms, rebuildUrl, settleUrl, supabaseRest } from "./env.js";

describe("worker env", () => {
  it("rebuilds ingest URL to rebuild-draw", () => {
    assert.equal(
      rebuildUrl({
        MATCHREAD_INGEST_URL:
          "https://example.supabase.co/functions/v1/ingest-events",
      }),
      "https://example.supabase.co/functions/v1/rebuild-draw"
    );
  });

  it("rebuilds ingest URL to settle-leagues", () => {
    assert.equal(
      settleUrl({
        MATCHREAD_INGEST_URL:
          "https://example.supabase.co/functions/v1/ingest-events",
      }),
      "https://example.supabase.co/functions/v1/settle-leagues"
    );
  });

  it("reads supabase from ingest URL when anon key is set", () => {
    const sb = supabaseRest({
      MATCHREAD_INGEST_URL:
        "https://example.supabase.co/functions/v1/ingest-events",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    assert.equal(sb.url, "https://example.supabase.co");
    assert.equal(sb.key, "anon");
  });

  it("rejects intervals under 5s", () => {
    assert.equal(ms({ WORKER_PUBLISH_MS: "1000" }, "WORKER_PUBLISH_MS", 99), 99);
    assert.equal(ms({ WORKER_PUBLISH_MS: "15000" }, "WORKER_PUBLISH_MS", 99), 15000);
  });
});
