/**
 * Winston-Salem rehearsal gate (offline): import → integrity → withhold → heal.
 * Does not require live SQL; proves the trust-boundary modules compose.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceWinnerToParent,
  assertDrawBelongsToTournament,
  bindResultsByPlayerPair,
  canonicalizeDisplayName,
  evaluateDrawIntegrity,
  isBracketProduct,
  normalizeSurface,
  normalizeTier,
  validateOfficialSeats,
} from "./index.js";

function winstonSeats() {
  // 32-draw ATP 250 shape with real provider ids and distinguishable labels
  return Array.from({ length: 32 }, (_, i) => {
    const names = [
      "Alex de Minaur",
      "Botic van de Zandschulp",
      "Felix Auger-Aliassime",
      "Pablo Carreño Busta",
    ];
    const full = names[i % names.length] + (i >= 4 ? ` ${i}` : "");
    const canon = canonicalizeDisplayName(full);
    return {
      position: i,
      kind: "player",
      seat_kind: "player",
      provider_player_id: `ws-${i + 1}`,
      last_name: canon.lastName,
      display_name: canon.displayName,
      seed: i < 8 ? i + 1 : null,
      country_code: ["AUS", "NED", "CAN", "ESP"][i % 4],
    };
  });
}

describe("Winston-Salem rehearsal (offline trust boundary)", () => {
  it("calendar tier is bracket product", () => {
    const tier = normalizeTier("ATP 250", "singles");
    assert.equal(tier.tier, "tour_250");
    assert.equal(isBracketProduct("atp", tier.tier), true);
    assert.equal(isBracketProduct("atp", "itf"), false);
  });

  it("surface is not defaulted to hard", () => {
    assert.equal(normalizeSurface(null), null);
    assert.equal(normalizeSurface("Hard"), "hard");
  });

  it("identity assert keeps ATP draw on ATP row", () => {
    assert.doesNotThrow(() =>
      assertDrawBelongsToTournament(
        { provider_id: "21400", tour: "atp" },
        { provider_id: "21400", tour: "atp" }
      )
    );
    assert.throws(() =>
      assertDrawBelongsToTournament(
        { provider_id: "21400", tour: "wta" },
        { provider_id: "21400", tour: "atp" }
      )
    );
  });

  it("official seats pass structure + integrity gate", () => {
    const seats = winstonSeats();
    const structure = validateOfficialSeats(seats);
    assert.equal(structure.ok, true);

    const report = evaluateDrawIntegrity({
      seats,
      tournament: {
        tour: "atp",
        provider_id: "21400",
        surface: "hard",
        bracket_eligible: true,
      },
      drawTour: "atp",
      drawProviderId: "21400",
      source: "official",
    });
    assert.equal(report.safeToPublish, true, JSON.stringify(report.blockingErrors));
  });

  it("integrity blocks ineligible publish", () => {
    const report = evaluateDrawIntegrity({
      seats: winstonSeats(),
      tournament: {
        tour: "atp",
        provider_id: "21400",
        surface: "hard",
        bracket_eligible: false,
      },
      source: "official",
    });
    assert.equal(report.safeToPublish, false);
    assert.ok(report.blockingErrors.some((e) => e.code === "eligibility"));
  });

  it("withheld R32 result heals into parent on supply", () => {
    const matchSides = [
      {
        match_key: "r0-m0",
        round: 0,
        index_in_round: 0,
        side_a_provider_id: "ws-1",
        side_b_provider_id: "ws-2",
      },
    ];
    assert.equal(
      bindResultsByPlayerPair([], matchSides, {}).results.length,
      0
    );

    const healed = bindResultsByPlayerPair(
      [
        {
          id: "m1",
          player1Id: "ws-1",
          player2Id: "ws-2",
          match_winner: "ws-1",
          result_type: "completed",
        },
      ],
      matchSides,
      { "ws-1": "ws-1", "ws-2": "ws-2" }
    );
    assert.equal(healed.results[0].winner_provider_id, "ws-1");
    const parent = advanceWinnerToParent(0, 0, "ws-1");
    assert.equal(parent.key, "r1-m0");
    assert.equal(parent.sideColumn, "side_a_player_id");
  });

  it("particle surnames stay distinguishable in display", () => {
    const a = canonicalizeDisplayName("Alex de Minaur");
    const b = canonicalizeDisplayName("Botic van de Zandschulp");
    assert.equal(a.lastName, "de Minaur");
    assert.equal(b.lastName, "van de Zandschulp");
    assert.notEqual(a.displayName, b.displayName);
  });
});
