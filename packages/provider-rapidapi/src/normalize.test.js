import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UnknownProviderValue,
  requireTour,
  normalizeTier,
  isBracketProduct,
  normalizeSurface,
  normalizeEnvironment,
  canonicalizeDisplayName,
  auxiliaryLastName,
  canAdvanceWinner,
  PUBLIC_TIERS,
} from "./normalize.js";
import {
  assertDrawBelongsToTournament,
  evaluateDrawIntegrity,
} from "./assert.js";

describe("normalizeTour writes", () => {
  it("requireTour rejects missing", () => {
    assert.throws(() => requireTour(undefined), UnknownProviderValue);
    assert.equal(requireTour("WTA"), "wta");
  });
});

describe("normalizeTier", () => {
  it("maps category without name guessing", () => {
    assert.equal(normalizeTier("ATP 250", null).tier, "tour_250");
    assert.equal(normalizeTier("Masters 1000", null).tier, "masters_1000");
    assert.equal(normalizeTier("Grand Slam", null).tier, "grand_slam");
    assert.equal(normalizeTier("Challenger", null).tier, "challenger");
    assert.equal(normalizeTier(null, null).tier, "other");
    assert.ok(normalizeTier(null, null).alert);
  });

  it("maps Tennis API calendar tier labels", () => {
    assert.equal(normalizeTier(null, null, "Challenger 75").tier, "challenger");
    assert.equal(normalizeTier(null, null, "Challenger 125").tier, "challenger");
    assert.equal(normalizeTier(null, null, "Challenger 50").tier, "challenger");
  });

  it("PUBLIC_TIERS matches isBracketProduct", () => {
    for (const tier of PUBLIC_TIERS) {
      assert.equal(isBracketProduct("atp", tier), true);
    }
    assert.equal(isBracketProduct("atp", "itf"), false);
    assert.equal(isBracketProduct("atp", "itf", "force_off"), false);
    assert.equal(isBracketProduct("atp", "grand_slam", "force_off"), false);
    assert.equal(isBracketProduct("atp", "itf", null), false);
  });
});

describe("normalizeSurface", () => {
  it("never defaults to hard", () => {
    assert.equal(normalizeSurface(null), null);
    assert.equal(normalizeSurface(""), null);
    assert.equal(normalizeSurface("Clay"), "clay");
    assert.equal(normalizeSurface("Grass"), "grass");
    assert.equal(normalizeSurface("Hard"), "hard");
    assert.throws(() => normalizeSurface("wood"), UnknownProviderValue);
  });

  it("accepts Tennis API court objects", () => {
    assert.equal(normalizeSurface({ id: 1, name: "Hard" }), "hard");
    assert.equal(normalizeSurface({ id: 2, name: "Clay" }), "clay");
    assert.equal(normalizeEnvironment({ id: 1, name: "Indoor Hard" }), "indoor");
  });

  it("splits indoor as environment", () => {
    assert.equal(normalizeEnvironment("Indoor Hard"), "indoor");
    assert.equal(normalizeSurface("Indoor Hard"), "hard");
  });
});

describe("canonicalizeDisplayName", () => {
  it("keeps particles and compounds", () => {
    assert.equal(
      canonicalizeDisplayName("Alex de Minaur").lastName,
      "de Minaur"
    );
    assert.equal(
      canonicalizeDisplayName("Botic van de Zandschulp").lastName,
      "van de Zandschulp"
    );
    assert.equal(
      canonicalizeDisplayName("Felix Auger-Aliassime").displayName,
      "Felix Auger-Aliassime"
    );
    assert.equal(
      canonicalizeDisplayName("Pablo Carreño Busta").lastName,
      "Carreño Busta"
    );
  });

  it("handles comma family-first", () => {
    const c = canonicalizeDisplayName("Gao, Mingzhou");
    assert.equal(c.displayName, "Mingzhou Gao");
    assert.equal(c.lastName, "Gao");
  });
});

describe("assertDrawBelongsToTournament", () => {
  it("rejects cross-tour", () => {
    assert.throws(() =>
      assertDrawBelongsToTournament(
        { provider_id: "1", tour: "wta" },
        { provider_id: "1", tour: "atp" }
      )
    );
  });

  it("accepts matching identity", () => {
    assert.doesNotThrow(() =>
      assertDrawBelongsToTournament(
        { providerTournamentId: "21347", tour: "atp" },
        { provider_id: "21347", tour: "atp" }
      )
    );
  });
});

describe("evaluateDrawIntegrity", () => {
  const baseSeats = (n, extra = {}) =>
    Array.from({ length: n }, (_, i) => ({
      position: i,
      kind: i % 2 === 0 && extra.byeEvens ? "bye" : "player",
      provider_player_id: `p${i}`,
      last_name: `Player${i}`,
      display_name: `Player${i}`,
      seed: i < 4 ? i + 1 : null,
      country_code: "USA",
      ...extra.seat?.(i),
    }));

  it("blocks ambiguous labels without discriminators", () => {
    const seats = baseSeats(8, {
      seat: (i) =>
        i === 0 || i === 1
          ? {
              last_name: "Gao",
              display_name: "Gao",
              seed: null,
              country_code: "CHN",
              provider_player_id: `g${i}`,
            }
          : {},
    });
    // fix non-gao seats to unique names already from base
    const report = evaluateDrawIntegrity({
      seats,
      tournament: { tour: "atp", provider_id: "1", bracket_eligible: true, surface: "hard" },
      source: "official",
    });
    assert.equal(report.safeToPublish, false);
    assert.ok(report.blockingErrors.some((e) => e.code === "ambiguous_label"));
  });

  it("allows duplicate labels with seed discriminators", () => {
    const seats = baseSeats(8, {
      seat: (i) =>
        i === 0 || i === 1
          ? {
              last_name: "Cerundolo",
              display_name: "Cerundolo",
              seed: i === 0 ? 1 : 8,
              country_code: "ARG",
              provider_player_id: `c${i}`,
            }
          : {},
    });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: { tour: "atp", provider_id: "1", bracket_eligible: true, surface: "hard" },
      source: "official",
    });
    assert.equal(report.safeToPublish, true);
  });

  it("warns on unknown surface", () => {
    const seats = baseSeats(8);
    const report = evaluateDrawIntegrity({
      seats,
      tournament: {
        tour: "atp",
        provider_id: "1",
        bracket_eligible: true,
        surface: null,
      },
      source: "official",
    });
    assert.equal(report.safeToPublish, true);
    assert.ok(report.warnings.some((w) => w.code === "surface"));
  });

  it("blocks a seedless 128 sheet as non-main", () => {
    const seats = Array.from({ length: 128 }, (_, i) => ({
      position: i,
      kind: "player",
      provider_player_id: `p${i}`,
      last_name: `Surname${i}`,
      display_name: `Surname${i}`,
      seed: null,
      country_code: "USA",
    }));
    const report = evaluateDrawIntegrity({
      seats,
      tournament: {
        tour: "wta",
        provider_id: "16743",
        bracket_eligible: true,
        surface: "hard",
        draw_size: 128,
      },
      source: "official",
    });
    assert.equal(report.safeToPublish, false);
    assert.ok(report.blockingErrors.some((e) => e.code === "draw_type"));
  });
});

describe("canAdvanceWinner", () => {
  it("advances walkover without requiring score", () => {
    assert.equal(canAdvanceWinner("WALKOVER", "p1"), true);
    assert.equal(canAdvanceWinner("RETIREMENT", "p1"), true);
    assert.equal(canAdvanceWinner("COMPLETED", null), false);
  });
});

describe("auxiliaryLastName", () => {
  it("does not strip de Minaur to Minaur", () => {
    assert.equal(auxiliaryLastName("Alex de Minaur"), "de Minaur");
  });
});
