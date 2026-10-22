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
  officialFactKind,
  officialScoreText,
  splitResultAbsences,
  matchLookupFromQuery,
  mergeSettledFact,
  settledFactSkipReason,
  clearsProvisionalLive,
  PUBLIC_TIERS,
} from "./normalize.js";
import {
  assertDrawBelongsToTournament,
  evaluateDrawIntegrity,
  maxOfficialByes,
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
  const eligible32 = {
    tour: "atp",
    provider_id: "1",
    bracket_eligible: true,
    surface: "hard",
    draw_size: 32,
  };

  const fieldSeats = ({ n, byeAt = [], tbdAt = [] }) => {
    const byes = new Set(byeAt);
    const tbds = new Set(tbdAt);
    let seed = 1;
    return Array.from({ length: n }, (_, i) => {
      if (byes.has(i)) {
        return {
          position: i,
          kind: "bye",
          seat_kind: "bye",
          is_bye: true,
          last_name: "Bye",
          provider_player_id: null,
          seed: null,
          country_code: "XXX",
        };
      }
      if (tbds.has(i)) {
        return {
          position: i,
          kind: "tbd",
          seat_kind: "tbd",
          is_bye: false,
          last_name: "Qualifier",
          tbd_label: "Qualifier",
          provider_player_id: null,
          seed: null,
          country_code: "XXX",
        };
      }
      const nextSeed = seed <= 32 ? seed++ : null;
      return {
        position: i,
        kind: "player",
        seat_kind: "player",
        provider_player_id: `p${i}`,
        last_name: `Surname${i}`,
        display_name: `Surname${i}`,
        seed: nextSeed,
        country_code: "USA",
      };
    });
  };

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
              // Same provider id → not distinguishable as different people.
              provider_player_id: "g-shared",
            }
          : {},
    });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: { tour: "atp", provider_id: "1", bracket_eligible: true, surface: "hard" },
      source: "official",
    });
    assert.equal(report.safeToPublish, false);
    assert.ok(report.blockingErrors.some((e) => e.code === "ambiguous_label"));
  });

  it("allows duplicate last names with distinct provider player ids", () => {
    const seats = baseSeats(8, {
      seat: (i) =>
        i === 0 || i === 1
          ? {
              last_name: "Wang",
              display_name: "Wang",
              given_name: i === 0 ? "Xinyu" : "Xiyu",
              seed: null,
              country_code: "CHN",
              provider_player_id: i === 0 ? "47152" : "43872",
            }
          : {},
    });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: {
        tour: "wta",
        provider_id: "16743",
        bracket_eligible: true,
        surface: "hard",
      },
      source: "official",
    });
    assert.equal(report.safeToPublish, true);
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

  it("allows a 32-slot sheet with four official byes (28-in-32)", () => {
    const seats = fieldSeats({ n: 32, byeAt: [1, 9, 17, 25] });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: eligible32,
      source: "official",
    });
    assert.equal(report.safeToPublish, true, JSON.stringify(report.blockingErrors));
    assert.equal(report.blockingErrors.some((e) => e.code === "impossible_byes"), false);
  });

  it("allows a 32-slot sheet with TBD occupants and no byes", () => {
    const seats = fieldSeats({ n: 32, tbdAt: [6, 13, 20, 27] });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: eligible32,
      source: "official",
    });
    assert.equal(report.safeToPublish, true, JSON.stringify(report.blockingErrors));
    assert.equal(report.blockingErrors.some((e) => e.code === "impossible_byes"), false);
  });

  it("allows a 32-slot sheet with four byes plus TBD (TBD is not a bye)", () => {
    const seats = fieldSeats({
      n: 32,
      byeAt: [1, 9, 17, 25],
      tbdAt: [6, 13, 20, 27],
    });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: eligible32,
      source: "official",
    });
    assert.equal(report.safeToPublish, true, JSON.stringify(report.blockingErrors));
  });

  it("blocks a 32-slot sheet with more byes than a 28-in-32 field", () => {
    const seats = fieldSeats({ n: 32, byeAt: [1, 5, 9, 13, 17] });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: eligible32,
      source: "official",
    });
    assert.equal(report.safeToPublish, false);
    assert.ok(report.blockingErrors.some((e) => e.code === "impossible_byes"));
  });

  it("blocks a first-round bye-versus-bye pair", () => {
    const seats = fieldSeats({ n: 32, byeAt: [0, 1] });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: eligible32,
      source: "official",
    });
    assert.equal(report.safeToPublish, false);
    assert.ok(
      report.blockingErrors.some(
        (e) => e.code === "impossible_byes" && /bye vs bye/.test(e.message)
      )
    );
  });

  it("allows a 128-slot sheet with 32 official seed byes", () => {
    const byeAt = Array.from({ length: 32 }, (_, i) => i * 4 + 1);
    const seats = fieldSeats({ n: 128, byeAt });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: {
        tour: "atp",
        provider_id: "1",
        bracket_eligible: true,
        surface: "hard",
        draw_size: 128,
      },
      source: "official",
    });
    assert.equal(report.safeToPublish, true, JSON.stringify(report.blockingErrors));
    assert.equal(maxOfficialByes(128), 32);
  });

  it("blocks a 128-slot sheet with more than 32 byes", () => {
    const byeAt = Array.from({ length: 33 }, (_, i) => i * 2 + 1);
    const seats = fieldSeats({ n: 128, byeAt });
    const report = evaluateDrawIntegrity({
      seats,
      tournament: {
        tour: "atp",
        provider_id: "1",
        bracket_eligible: true,
        surface: "hard",
        draw_size: 128,
      },
      source: "official",
    });
    assert.equal(report.safeToPublish, false);
    assert.ok(report.blockingErrors.some((e) => e.code === "impossible_byes"));
  });
});

describe("canAdvanceWinner", () => {
  it("advances a captured archive type and leaves other words alone", () => {
    assert.equal(canAdvanceWinner("retired", "p1"), true);
    assert.equal(canAdvanceWinner("COMPLETED", "p1"), true);
    assert.equal(canAdvanceWinner("WALKOVER", "p1"), false);
    assert.equal(canAdvanceWinner("cancelled", "p1"), false);
    assert.equal(canAdvanceWinner("suspended", "p1"), false);
    assert.equal(canAdvanceWinner("COMPLETED", null), false);
  });
});

describe("auxiliaryLastName", () => {
  it("does not strip de Minaur to Minaur", () => {
    assert.equal(auxiliaryLastName("Alex de Minaur"), "de Minaur");
  });
});

describe("official score and fact class", () => {
  it("keeps published score text and ignores a bye token", () => {
    assert.equal(officialScoreText({ result: "6-4 3-6 7-6(5)" }), "6-4 3-6 7-6(5)");
    assert.equal(officialScoreText({ result: "bye" }), null);
    assert.equal(officialScoreText({ result: 3 }), null);
    assert.equal(officialScoreText({ score: "6-4 6-3" }), null);
    assert.equal(officialScoreText({ result: "  " }), null);
  });

  it("splits withdrawal from an ingestion gap", () => {
    const rows = [
      { id: "w1", result_type: "walkover", match_winner: "9" },
      { id: "g1", result_type: "completed", match_winner: "0", result: "" },
      { id: "p1", result_type: "retired", match_winner: "4", result: "6-3 ret." },
      { id: "u1", result_type: "", match_winner: null },
    ];
    assert.equal(officialFactKind(rows[0]), null);
    assert.equal(officialFactKind(rows[1]), null);
    assert.equal(officialFactKind(rows[2]), "played");
    const split = splitResultAbsences(rows);
    assert.deepEqual(split.withdrawal, []);
    assert.deepEqual(split.ingestionGap, ["g1"]);
  });

  it("fills a missing score and refuses a conflicting settled winner", () => {
    const fill = mergeSettledFact(
      {
        settled_at: "2026-08-12T00:00:00.000Z",
        winner_player_id: "a",
        voided: false,
        official_score: null,
        fact_kind: null,
      },
      {
        winner_player_id: "a",
        voided: false,
        official_score: "6-4 6-2",
        fact_kind: "played",
      }
    );
    assert.equal(fill.action, "fill");
    assert.equal(fill.patch.official_score, "6-4 6-2");
    assert.equal(fill.patch.fact_kind, "played");

    const conflict = mergeSettledFact(
      {
        settled_at: "2026-08-12T00:00:00.000Z",
        winner_player_id: "a",
        voided: false,
        official_score: "6-4 6-2",
        fact_kind: "played",
      },
      {
        winner_player_id: "b",
        voided: false,
        official_score: "6-0 6-0",
        fact_kind: "withdrawal",
      }
    );
    assert.equal(conflict.action, "conflict");
    assert.equal(conflict.patch.official_score, undefined);
    assert.equal(conflict.patch.winner_player_id, undefined);
    assert.ok(conflict.conflicts.includes("winner"));
    assert.ok(conflict.conflicts.includes("score"));
    assert.equal(settledFactSkipReason(conflict), "winner conflict");

    const donated = mergeSettledFact(
      {
        settled_at: "2026-08-12T00:00:00.000Z",
        winner_player_id: "a",
        voided: false,
        official_score: null,
        fact_kind: null,
      },
      {
        winner_player_id: "b",
        voided: false,
        official_score: "6-0 6-0",
        fact_kind: "withdrawal",
      }
    );
    assert.equal(donated.action, "conflict");
    assert.deepEqual(donated.patch, {});
    assert.ok(donated.conflicts.includes("winner"));
    assert.equal(donated.conflicts.includes("score"), false);
  });

  it("keeps an already-correct scoreline and names a different one", () => {
    const settled = {
      settled_at: "2026-08-12T00:00:00.000Z",
      winner_player_id: "a",
      voided: false,
      official_score: "6-4 6-2",
      fact_kind: "played",
    };
    const same = mergeSettledFact(settled, {
      winner_player_id: "a",
      voided: false,
      official_score: "  6-4 6-2  ",
      fact_kind: "played",
    });
    assert.equal(same.action, "noop");
    assert.deepEqual(same.conflicts, []);
    assert.equal(same.patch.official_score, undefined);
    assert.equal(same.patch.winner_player_id, undefined);
    assert.equal(settledFactSkipReason(same), "already settled");

    const again = mergeSettledFact(
      { ...settled, official_score: same.patch.official_score ?? settled.official_score },
      {
        winner_player_id: "a",
        voided: false,
        official_score: "6-4 6-2",
        fact_kind: "played",
      }
    );
    assert.equal(again.action, "noop");

    const retired = mergeSettledFact(
      { ...settled, official_score: null, fact_kind: null },
      {
        winner_player_id: "a",
        voided: false,
        official_score: "6-3 3-0 ret.",
        fact_kind: "played",
      }
    );
    assert.equal(retired.action, "fill");
    assert.equal(retired.patch.official_score, "6-3 3-0 ret.");
    assert.equal(retired.patch.winner_player_id, undefined);
    assert.equal(settledFactSkipReason(retired), "filled missing fact");

    const different = mergeSettledFact(settled, {
      winner_player_id: "a",
      voided: false,
      official_score: "6-0 6-0",
      fact_kind: "played",
    });
    assert.equal(different.action, "noop");
    assert.equal(different.patch.official_score, undefined);
    assert.deepEqual(different.conflicts, ["score"]);
    assert.equal(settledFactSkipReason(different), "score conflict");
    assert.equal(clearsProvisionalLive(different.action), true);
  });

  it("clears a provisional live row when REST confirms, and keeps it on a winner conflict", () => {
    const open = mergeSettledFact(
      { settled_at: null, winner_player_id: null, official_score: null },
      { winner_player_id: "a", official_score: "6-4 6-2", fact_kind: "played" }
    );
    assert.equal(open.action, "write");
    assert.equal(clearsProvisionalLive(open.action), true);

    const settled = {
      settled_at: "2026-08-12T00:00:00.000Z",
      winner_player_id: "a",
      voided: false,
      official_score: null,
      fact_kind: null,
    };
    const filled = mergeSettledFact(settled, {
      winner_player_id: "a",
      official_score: "6-4 6-2",
      fact_kind: "played",
    });
    assert.equal(filled.action, "fill");
    assert.equal(clearsProvisionalLive(filled.action), true);

    const again = mergeSettledFact(
      { ...settled, official_score: "6-4 6-2", fact_kind: "played" },
      { winner_player_id: "a", official_score: "6-4 6-2", fact_kind: "played" }
    );
    assert.equal(again.action, "noop");
    assert.equal(clearsProvisionalLive(again.action), true);

    const conflict = mergeSettledFact(
      { ...settled, official_score: "6-4 6-2", fact_kind: "played" },
      { winner_player_id: "b", official_score: "6-4 6-2", fact_kind: "played" }
    );
    assert.equal(conflict.action, "conflict");
    assert.equal(clearsProvisionalLive(conflict.action), false);
    assert.equal(clearsProvisionalLive(null), false);
  });

  it("treats a missing official_score column as a failed lookup, not a missing match", () => {
    const missing = matchLookupFromQuery({
      data: null,
      error: { message: "column matches.official_score does not exist" },
    });
    assert.deepEqual(missing, {
      ok: false,
      error: "column matches.official_score does not exist",
    });

    const absent = matchLookupFromQuery({ data: null, error: null });
    assert.deepEqual(absent, { ok: true, row: null });

    const row = { id: "m1", official_score: "6-4 6-2" };
    assert.deepEqual(matchLookupFromQuery({ data: row, error: null }), {
      ok: true,
      row,
    });
    assert.deepEqual(matchLookupFromQuery({ error: {} }), {
      ok: false,
      error: "match select failed",
    });
    assert.deepEqual(matchLookupFromQuery(null), {
      ok: false,
      error: "match select failed",
    });
    assert.deepEqual(matchLookupFromQuery({ error: { message: "   " } }), {
      ok: false,
      error: "match select failed",
    });
  });
});
