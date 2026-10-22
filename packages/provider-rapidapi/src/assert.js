/**
 * Identity + draw integrity asserts (pure).
 */

import { validateOfficialSeats } from "./official/draw-hash.js";
import { classifyDraw, countSeeds } from "./official/classify-draw.js";
import { parseTour } from "./normalize.js";

/**
 * @param {{ providerTournamentId?: string|null, provider_id?: string|null, tour?: string|null, providerSeasonId?: string|null }} draw
 * @param {{ provider_id?: string|null, providerTournamentId?: string|null, tour?: string|null, provider_season_id?: string|null }} tournament
 */
export function assertDrawBelongsToTournament(draw, tournament) {
  const drawPid = String(
    draw.providerTournamentId ?? draw.provider_id ?? ""
  ).trim();
  const tourPid = String(
    tournament.provider_id ?? tournament.providerTournamentId ?? ""
  ).trim();
  if (!drawPid || !tourPid || drawPid !== tourPid) {
    throw new Error(
      `provider tournament mismatch: draw ${drawPid} into ${tourPid}`
    );
  }

  const drawTour = parseTour(draw.tour);
  const rowTour = parseTour(tournament.tour);
  if (!drawTour || !rowTour || drawTour !== rowTour) {
    throw new Error(
      `tour mismatch: draw ${draw.tour} into ${tournament.tour} tournament`
    );
  }

  const drawSeason = draw.providerSeasonId
    ? String(draw.providerSeasonId).trim()
    : "";
  const rowSeason = tournament.provider_season_id
    ? String(tournament.provider_season_id).trim()
    : "";
  if (drawSeason && rowSeason && drawSeason !== rowSeason) {
    throw new Error(
      `provider season mismatch: ${drawSeason} into ${rowSeason}`
    );
  }
}

/**
 * Official seed-bye ceiling for a power-of-two slot sheet.
 * 16/32-slot fields: at most N/8 (a 28-in-32 sheet has 4).
 * 64/128-slot fields: at most N/4 (a 48-in-64 sheet has 16; a 96-in-128 sheet has 32).
 * TBD seats are field occupants, not byes.
 */
export function maxOfficialByes(slotCount) {
  const n = Number(slotCount);
  if (!Number.isInteger(n) || n < 8 || (n & (n - 1)) !== 0) return 0;
  return n <= 32 ? n / 8 : n / 4;
}

function seatKindOf(s) {
  return s.seat_kind || s.kind || (s.is_bye ? "bye" : "player");
}

/**
 * @typedef {{ code: string, message: string, seat?: number }} IntegrityIssue
 * @typedef {{
 *   safeToPublish: boolean,
 *   blockingErrors: IntegrityIssue[],
 *   warnings: IntegrityIssue[],
 *   checkedAt: string,
 *   sourceSnapshotId?: string|null,
 * }} IntegrityReport
 */

/**
 * Full publish gate. Rows existing is not enough.
 * @param {{
 *   seats: any[],
 *   tournament?: { tour?: string, provider_id?: string, surface?: string|null, bracket_eligible?: boolean|null, draw_checked_at?: string|null, draw_size?: number|null },
 *   drawTour?: string|null,
 *   drawProviderId?: string|null,
 *   drawPathHint?: string|null,
 *   drawProviderType?: string|null,
 *   terminalRoundMatches?: number|null,
 *   source?: string|null,
 *   sourceSnapshotId?: string|null,
 * }} input
 * @returns {IntegrityReport}
 */
export function evaluateDrawIntegrity(input) {
  /** @type {IntegrityIssue[]} */
  const blockingErrors = [];
  /** @type {IntegrityIssue[]} */
  const warnings = [];
  const seats = Array.isArray(input.seats) ? input.seats : [];
  const tournament = input.tournament || {};

  if (input.source && input.source !== "official" && input.source !== "overlay") {
    blockingErrors.push({
      code: "source",
      message: `non-official draw source: ${input.source}`,
    });
  }

  const validated = validateOfficialSeats(seats);
  if (!validated.ok) {
    blockingErrors.push({
      code: "structure",
      message: validated.reason || "invalid draw structure",
    });
  }

  const drawTour = parseTour(input.drawTour ?? tournament.tour);
  const rowTour = parseTour(tournament.tour);
  if (input.drawTour != null && drawTour && rowTour && drawTour !== rowTour) {
    blockingErrors.push({
      code: "tour",
      message: `tour mismatch: draw ${input.drawTour} vs tournament ${tournament.tour}`,
    });
  }

  const drawPid = String(input.drawProviderId ?? "").trim();
  const rowPid = String(tournament.provider_id ?? "").trim();
  if (drawPid && rowPid && drawPid !== rowPid) {
    blockingErrors.push({
      code: "identity",
      message: `provider id mismatch: ${drawPid} vs ${rowPid}`,
    });
  }

  if (tournament.bracket_eligible === false) {
    blockingErrors.push({
      code: "eligibility",
      message: "tournament is not bracket_eligible",
    });
  }

  // Draw type: size is never the classifier. Reject qualifying-shaped sheets.
  const seedCount = countSeeds(seats);
  const expectedSize =
    Number(tournament.draw_size) ||
    (validated.ok ? seats.length : 0) ||
    seats.length;
  const drawClass = classifyDraw(
    {
      size: seats.length,
      expectedSize,
      seedCount,
      pathHint: input.drawPathHint ?? null,
      providerType: input.drawProviderType ?? null,
      terminalRoundMatches: input.terminalRoundMatches ?? null,
    },
    { draw_size: tournament.draw_size ?? expectedSize }
  );
  if (drawClass.kind === "rejected") {
    blockingErrors.push({
      code: "draw_type",
      message: `rejected ${drawClass.reason}`,
    });
  }

  const n = seats.length;
  let byeCount = 0;
  for (const s of seats) {
    if (seatKindOf(s) === "bye") byeCount += 1;
  }
  const maxByes = maxOfficialByes(n);
  if (byeCount > maxByes) {
    blockingErrors.push({
      code: "impossible_byes",
      message: `bye count ${byeCount} exceeds official maximum ${maxByes} for a ${n}-slot field`,
    });
  }
  if (validated.ok) {
    const kindAt = new Array(n);
    for (const s of seats) {
      const pos = Number(s.position);
      if (Number.isInteger(pos) && pos >= 0 && pos < n) {
        kindAt[pos] = seatKindOf(s);
      }
    }
    for (let i = 0; i < n; i += 2) {
      if (kindAt[i] === "bye" && kindAt[i + 1] === "bye") {
        blockingErrors.push({
          code: "impossible_byes",
          message: `first-round pair at seats ${i}/${i + 1} is bye vs bye`,
          seat: i,
        });
      }
    }
  }

  if (tournament.surface == null || tournament.surface === "") {
    warnings.push({
      code: "surface",
      message: "surface unknown (not defaulted)",
    });
  }

  if (tournament.draw_checked_at) {
    const age = Date.now() - Date.parse(String(tournament.draw_checked_at));
    if (Number.isFinite(age) && age > 6 * 60 * 60 * 1000) {
      warnings.push({
        code: "freshness",
        message: "draw_checked_at older than 6h",
      });
    }
  }

  /** @type {Map<string, { seats: number[], seeds: (number|null)[], countries: string[], pids: string[], givens: string[] }>} */
  const byLabel = new Map();

  for (const s of seats) {
    const kind = s.seat_kind || s.kind || (s.is_bye ? "bye" : "player");
    const pos = Number(s.position);
    if (kind === "player") {
      const pid = s.provider_player_id ? String(s.provider_player_id) : "";
      if (!pid || pid.startsWith("mds:")) {
        blockingErrors.push({
          code: "player_id",
          message: "named seat missing provider_player_id",
          seat: pos,
        });
      }
      const label = String(
        s.display_name || s.last_name || ""
      )
        .trim()
        .toLowerCase();
      if (!label) {
        blockingErrors.push({
          code: "display",
          message: "named seat missing display label",
          seat: pos,
        });
        continue;
      }
      if (s.fallback_formatted) {
        blockingErrors.push({
          code: "display_fallback",
          message: `fallback-formatted name at seat ${pos}`,
          seat: pos,
        });
      }
      const entry = byLabel.get(label) || {
        seats: [],
        seeds: [],
        countries: [],
        pids: [],
        givens: [],
      };
      entry.seats.push(pos);
      entry.seeds.push(s.seed == null ? null : Number(s.seed));
      entry.countries.push(
        String(s.country_code || s.country || "")
          .trim()
          .toUpperCase()
      );
      entry.pids.push(pid);
      entry.givens.push(
        String(s.given_name || "")
          .trim()
          .toLowerCase()
      );
      byLabel.set(label, entry);
    }
  }

  for (const [label, entry] of byLabel) {
    if (entry.seats.length < 2) continue;
    const distinguishable = entry.seats.every((_, i) => {
      const seed = entry.seeds[i];
      const country = entry.countries[i];
      const pid = entry.pids[i];
      const given = entry.givens[i];
      const others = entry.seats.map((_, j) => j).filter((j) => j !== i);
      return others.every((j) => {
        // Distinct Tennis API player ids are different people (official fact).
        if (pid && entry.pids[j] && pid !== entry.pids[j]) return true;
        if (given && entry.givens[j] && given !== entry.givens[j]) return true;
        const seedDiff =
          seed != null &&
          entry.seeds[j] != null &&
          seed !== entry.seeds[j];
        const countryDiff =
          country &&
          entry.countries[j] &&
          country !== entry.countries[j] &&
          country !== "XXX" &&
          entry.countries[j] !== "XXX";
        return seedDiff || countryDiff;
      });
    });
    if (!distinguishable) {
      blockingErrors.push({
        code: "ambiguous_label",
        message: `indistinguishable seats labelled "${label}"`,
      });
    }
  }

  return {
    safeToPublish: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    checkedAt: new Date().toISOString(),
    sourceSnapshotId: input.sourceSnapshotId ?? null,
  };
}
