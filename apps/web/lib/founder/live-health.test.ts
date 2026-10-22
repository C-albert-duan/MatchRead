import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HEARTBEAT_ALARM_MS,
  PROVIDER_EVENT_ALARM_MS,
  carriedMappingMisses,
  founderLiveHealth,
  hasFreshnessWarning,
  latestInstant,
  type ListenerTick,
} from "./live-health.ts";

const now = Date.parse("2026-10-10T18:00:00.000Z");

function tick(over: Partial<ListenerTick> = {}): ListenerTick {
  return {
    connection: "up",
    lastHeartbeatAt: new Date(now - 30_000).toISOString(),
    lastProviderEventAt: new Date(now - 20_000).toISOString(),
    eventsIn: 4,
    mapped: 3,
    unmapped: 1,
    lagMs: null,
    ...over,
  };
}

function health(over: Partial<Parameters<typeof founderLiveHealth>[0]> = {}) {
  return founderLiveHealth({
    now,
    listener: tick(),
    activePlay: false,
    expectedPlay: false,
    disagreements: 0,
    carriedUnmapped: 0,
    drawFreshness: false,
    ...over,
  });
}

describe("founder live health", () => {
  it("marks a heartbeat older than two minutes during active play", () => {
    const stale = health({
      activePlay: true,
      listener: tick({
        lastHeartbeatAt: new Date(now - HEARTBEAT_ALARM_MS - 1).toISOString(),
      }),
    });
    assert.equal(stale.heartbeat.level, "error");
    assert.equal(stale.connected, true);

    const quiet = health({
      listener: tick({
        lastHeartbeatAt: new Date(now - HEARTBEAT_ALARM_MS - 1).toISOString(),
      }),
    });
    assert.equal(quiet.heartbeat.level, "ok");

    const fresh = health({
      activePlay: true,
      listener: tick({
        lastHeartbeatAt: new Date(now - HEARTBEAT_ALARM_MS).toISOString(),
      }),
    });
    assert.equal(fresh.heartbeat.level, "ok");
  });

  it("marks a missing provider event after five minutes of expected play", () => {
    const stale = health({
      expectedPlay: true,
      listener: tick({
        lastProviderEventAt: new Date(now - PROVIDER_EVENT_ALARM_MS - 1).toISOString(),
      }),
    });
    assert.equal(stale.providerEvent.level, "event");

    const idle = health({
      listener: tick({
        lastProviderEventAt: new Date(now - PROVIDER_EVENT_ALARM_MS - 1).toISOString(),
      }),
    });
    assert.equal(idle.providerEvent.level, "ok");
  });

  it("does not alarm on an unmapped feed, and does alarm on a carried tournament miss", () => {
    const foreign = health({
      listener: tick({ eventsIn: 12, mapped: 0, unmapped: 12 }),
    });
    assert.equal(foreign.mapping.level, "ok");
    assert.equal(foreign.mapping.unmapped, 12);
    assert.equal(foreign.carriedUnmapped.level, "ok");

    const misses = carriedMappingMisses(
      [
        { payload: { provider_tournament_id: "900", player1: { name: "Alpha" } } },
        { payload: { provider_tournament_id: "901" } },
        { payload: { provider_tournament_id: "Not a tournament" } },
        { payload: { reason: "no match" } },
      ],
      new Set(["900"])
    );
    assert.equal(misses, 1);
    assert.equal(health({ carriedUnmapped: misses }).carriedUnmapped.level, "event");
  });

  it("treats a carried unmapped event as an event and a REST disagreement as an error", () => {
    const row = health({ carriedUnmapped: 1, disagreements: 2 });
    assert.equal(row.carriedUnmapped.level, "event");
    assert.equal(row.disagreement.level, "error");
    assert.equal(row.disagreement.count, 2);
  });

  it("renders provider freshness only when a stored lag or freshness warning exists", () => {
    assert.equal(health().providerFreshness, null);
    assert.deepEqual(health({ listener: tick({ lagMs: 1200 }) }).providerFreshness, {
      lagMs: 1200,
      drawFreshness: false,
    });
    assert.deepEqual(health({ drawFreshness: true }).providerFreshness, {
      lagMs: null,
      drawFreshness: true,
    });
    assert.equal(hasFreshnessWarning([{ code: "surface" }]), false);
    assert.equal(hasFreshnessWarning([{ code: "freshness" }]), true);
  });

  it("keeps the newer provider clock from the listener tick or the live row", () => {
    const older = "2026-10-10T17:00:00.000Z";
    const newer = "2026-10-10T17:50:00.000Z";
    assert.equal(latestInstant(older, newer), newer);
    assert.equal(latestInstant(newer, null), newer);
    assert.equal(latestInstant(null, null), null);
  });
});
