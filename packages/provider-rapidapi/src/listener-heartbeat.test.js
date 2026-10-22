import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEARTBEAT_MS,
  heartbeatDue,
  listenerHealthRow,
  nextWakeMs,
} from "./listener-heartbeat.js";

describe("listener heartbeat", () => {
  it("is due about every 30 seconds", () => {
    assert.equal(HEARTBEAT_MS, 30_000);
    assert.equal(heartbeatDue(null, 1_000), true);
    assert.equal(heartbeatDue(1_000, 30_999), false);
    assert.equal(heartbeatDue(1_000, 31_000), true);
  });

  it("wakes for the sooner of the next read and the next heartbeat", () => {
    assert.equal(nextWakeMs(0, 60_000, 30_000), 30_000);
    assert.equal(nextWakeMs(0, 5_000, 30_000), 5_000);
  });

  it("stores the latest tick and drops secrets", () => {
    const row = listenerHealthRow(
      {
        connected: true,
        lastProviderEventAt: "2026-10-10T15:00:00.000Z",
        eventsReceived: 41,
        mapped: 12,
        unmapped: 29,
        lagMs: 310,
        tokenAgeS: 2044,
        instanceId: "replica-a",
        token: "aaa.bbb.ccc",
        secret: "ingest-secret",
      },
      "2026-10-10T15:00:01.000Z"
    );
    assert.equal(row.id, "listener");
    assert.equal(row.connection, "up");
    assert.equal(row.events_received, 41);
    assert.equal(row.mapped_count, 12);
    assert.equal(row.unmapped_count, 29);
    assert.equal(row.lag_ms, 310);
    assert.equal(row.token_age_s, 2044);
    assert.equal(row.last_error, null);
    assert.equal(JSON.stringify(row).includes("aaa.bbb.ccc"), false);
    assert.equal(JSON.stringify(row).includes("ingest-secret"), false);
  });

  it("rejects a tick whose counts do not partition", () => {
    assert.equal(
      listenerHealthRow(
        {
          connected: true,
          lastProviderEventAt: null,
          eventsReceived: 4,
          mapped: 1,
          unmapped: 1,
          lagMs: null,
          tokenAgeS: null,
          instanceId: "replica-a",
        },
        "2026-10-10T15:00:01.000Z"
      ),
      null
    );
  });
});
