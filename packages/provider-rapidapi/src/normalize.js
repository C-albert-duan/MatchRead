/**
 * Shared provider → MatchRead normalization.
 * Pure: no I/O. Used by sync-facts, apply-draw path, verify CLI, and tests.
 */

export const PUBLIC_TIERS = Object.freeze([
  "grand_slam",
  "tour_finals",
  "masters_1000",
  "tour_500",
  "tour_250",
]);

export const ALL_TIERS = Object.freeze([
  ...PUBLIC_TIERS,
  "challenger",
  "wta_125",
  "itf",
  "other",
]);

export class UnknownProviderValue extends Error {
  /**
   * @param {string} field
   * @param {unknown} raw
   */
  constructor(field, raw) {
    super(`unknown provider ${field}: ${JSON.stringify(raw)}`);
    this.name = "UnknownProviderValue";
    this.field = field;
    this.raw = raw;
  }
}

/**
 * @param {string|null|undefined} tour
 * @returns {'atp'|'wta'|null}
 */
export function parseTour(tour) {
  const t = String(tour || "")
    .trim()
    .toLowerCase();
  if (t === "atp") return "atp";
  if (t === "wta") return "wta";
  return null;
}

/**
 * Require an explicit tour for writes. Do not default to ATP.
 * @param {string|null|undefined} tour
 * @returns {'atp'|'wta'}
 */
export function requireTour(tour) {
  const t = parseTour(tour);
  if (!t) {
    throw new UnknownProviderValue("tour", tour);
  }
  return t;
}

/**
 * Map provider category / type / tier label → closed tier set.
 * Tennis API calendar uses `tier` (e.g. "Challenger 75"); older shapes use category/type.
 * Does not guess from tournament name when those fields are absent.
 * @param {string|null|undefined} category
 * @param {string|null|undefined} type
 * @param {string|null|undefined} [tierLabel] provider `tier` string
 * @returns {{ tier: string, alert?: string }}
 */
export function normalizeTier(category, type, tierLabel) {
  const blob = `${category ?? ""} ${type ?? ""} ${tierLabel ?? ""}`
    .toLowerCase()
    .trim();
  if (!blob) {
    return { tier: "other", alert: "missing category" };
  }

  if (/grand\s*slam|slam/.test(blob)) return { tier: "grand_slam" };
  if (/tour\s*finals|atp\s*finals|wta\s*finals|finals/.test(blob) && !/500|250|1000/.test(blob)) {
    return { tier: "tour_finals" };
  }
  if (/masters|1000|wta\s*1000|atp\s*1000/.test(blob)) return { tier: "masters_1000" };
  if (/\b500\b|tour\s*500|atp\s*500|wta\s*500/.test(blob)) return { tier: "tour_500" };
  if (/\b250\b|tour\s*250|atp\s*250|wta\s*250/.test(blob)) return { tier: "tour_250" };
  // Challenger before bare "125" so "Challenger 125" stays challenger.
  if (/challenger/.test(blob)) return { tier: "challenger" };
  if (/wta\s*125|125k|\b125\b/.test(blob)) return { tier: "wta_125" };
  if (/\bitf\b|\bm15\b|\bm25\b|\bw15\b|\bw35\b|\bw50\b|\bw75\b|\bw100\b/.test(blob)) {
    return { tier: "itf" };
  }

  return { tier: "other", alert: `unmapped category: ${blob}` };
}

/**
 * When the calendar has no end date, infer week length from tier (Mon start → Sun end = +6).
 * Grand Slam / Masters use a two-week window. Never invent players — only a calendar bound.
 * @param {string|null|undefined} tier
 * @returns {number}
 */
export function defaultTournamentSpanDays(tier) {
  const t = String(tier || "");
  if (t === "grand_slam" || t === "masters_1000" || t === "tour_finals") return 13;
  return 6;
}

/**
 * @param {string|null|undefined} tour
 * @param {string|null|undefined} tier
 * @param {'force_off'|null|undefined} override
 */
export function isBracketProduct(tour, tier, override = null) {
  if (override === "force_off") return false;
  const t = parseTour(tour);
  if (!t) return false;
  return PUBLIC_TIERS.includes(String(tier || "other"));
}

/**
 * Unwrap Tennis API court/surface objects to a string label.
 * @param {unknown} raw
 * @returns {unknown}
 */
function surfaceLabel(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") {
    const o = /** @type {Record<string, unknown>} */ (raw);
    return o.name ?? o.Name ?? o.type ?? o.surface ?? null;
  }
  return raw;
}

/**
 * Surface only. Indoor is environment, not surface.
 * Accepts string or `{ name: "Hard" }` (API `court` / `surface` objects).
 * Unknown → null (never coerce to hard).
 * @param {unknown} raw
 * @returns {'hard'|'clay'|'grass'|'carpet'|null}
 */
export function normalizeSurface(raw) {
  const label = surfaceLabel(raw);
  if (label == null || label === "") return null;
  const v = String(label).trim().toLowerCase();
  if (!v || v === "[object object]") {
    throw new UnknownProviderValue("surface", raw);
  }
  if (v.includes("clay")) return "clay";
  if (v.includes("grass")) return "grass";
  if (v.includes("carpet")) return "carpet";
  if (v.includes("hard")) return "hard";
  // "indoor" alone is environment — not a surface guess
  if (v === "indoor" || v === "outdoor") return null;
  throw new UnknownProviderValue("surface", raw);
}

/**
 * @param {unknown} raw
 * @returns {'outdoor'|'indoor'|null}
 */
export function normalizeEnvironment(raw) {
  const label = surfaceLabel(raw);
  if (label == null || label === "") return null;
  const v = String(label).trim().toLowerCase();
  if (!v || v === "[object object]") return null;
  if (v.includes("indoor")) return "indoor";
  if (v.includes("outdoor")) return "outdoor";
  if (v.includes("carpet") && !v.includes("outdoor")) return "indoor";
  return null;
}

/** Western surname particles kept with the family name. */
const PARTICLES = new Set([
  "de",
  "del",
  "della",
  "der",
  "di",
  "du",
  "la",
  "le",
  "van",
  "von",
  "da",
  "dos",
  "das",
  "do",
]);

/**
 * Conservative auxiliary last-name for indexes / fiction checks.
 * Prefer canonicalizeDisplayName for UI.
 * @param {string|null|undefined} full
 */
export function auxiliaryLastName(full) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  // Keep trailing particle + name (de Minaur, van de Zandschulp)
  let i = parts.length - 1;
  const out = [parts[i]];
  i -= 1;
  let sawParticle = false;
  while (i >= 0 && PARTICLES.has(parts[i].toLowerCase().replace(/\./g, ""))) {
    sawParticle = true;
    out.unshift(parts[i]);
    i -= 1;
  }
  if (sawParticle) return out.join(" ");

  // Two-word family name without particle (Carreño Busta)
  if (parts.length >= 3) {
    return parts.slice(-2).join(" ");
  }
  return parts[parts.length - 1];
}

/**
 * Canonical user-facing display name from provider.
 * Preserves particles, hyphens, accents, multiword surnames.
 * Family-name-first (comma form "Last, First") → "First Last" for display
 * when comma is present; otherwise preserve provider order.
 * @param {string|null|undefined} full
 * @param {{ familyNameFirst?: boolean }} [opts]
 * @returns {{ displayName: string, lastName: string, fallback: boolean }}
 */
export function canonicalizeDisplayName(full, opts = {}) {
  const raw = String(full || "").trim().replace(/\s+/g, " ");
  if (!raw) {
    return { displayName: "", lastName: "", fallback: true };
  }

  if (raw.includes(",")) {
    const [family, ...rest] = raw.split(",").map((s) => s.trim());
    const given = rest.join(" ").trim();
    const displayName = given ? `${given} ${family}` : family;
    return {
      displayName,
      lastName: auxiliaryLastName(family) || family,
      fallback: false,
    };
  }

  if (opts.familyNameFirst) {
    const parts = raw.split(" ");
    if (parts.length >= 2) {
      const family = parts[0];
      const given = parts.slice(1).join(" ");
      return {
        displayName: `${given} ${family}`.trim(),
        lastName: family,
        fallback: true,
      };
    }
  }

  return {
    displayName: raw,
    lastName: auxiliaryLastName(raw),
    fallback: false,
  };
}

/**
 * Archive types that may advance a winner: `completed` and `retired`.
 * @type {ReadonlySet<string>}
 */
export const ADVANCING_OUTCOMES = Object.freeze(
  new Set(["completed", "COMPLETED", "retired", "RETIRED"])
);

/**
 * Disposition for a results-archive `result_type`.
 * An empty type stays settleable: some finished rows omit it and still carry a winner.
 * `completed` and `retired` were in the captures. Any other word is unknown:
 * it does not advance, void, or grade.
 *
 * @param {string|null|undefined} resultType
 * @returns {{ kind: 'settle'|'void'|'skip'|'unknown', advances: boolean, grades: boolean, voided: boolean }}
 */
export function outcomeDisposition(resultType) {
  const raw = String(resultType || "")
    .trim()
    .toLowerCase();
  if (!raw || raw === "completed" || raw === "final") {
    return { kind: "settle", advances: true, grades: true, voided: false };
  }
  if (raw === "retired") {
    return { kind: "settle", advances: true, grades: true, voided: false };
  }
  return { kind: "unknown", advances: false, grades: false, voided: false };
}

/**
 * @param {string|null|undefined} outcome
 * @param {string|null|undefined} winnerId
 */
export function canAdvanceWinner(outcome, winnerId) {
  if (!winnerId) return false;
  if (!outcome) return true; // provider often omits when winner id present
  const o = String(outcome).trim();
  if (ADVANCING_OUTCOMES.has(o)) return true;
  const u = o.toUpperCase();
  return ADVANCING_OUTCOMES.has(u);
}

const PLAYED_TYPES = new Set(["completed", "final", "retired"]);

/**
 * Official score text as published. Never parsed into a winner.
 * The bye token is a seat fact, not a score.
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {string|null}
 */
export function officialScoreText(row) {
  const raw = row && typeof row === "object" ? row.result : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || /^bye$/i.test(text)) return null;
  return text;
}

/** @param {unknown} value */
function publishedScore(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Official fact class from result_type.
 * Only `completed` and `retired` are classified. Other words stay null.
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {'played'|'withdrawal'|'void'|null}
 */
export function officialFactKind(row) {
  const raw = String(row?.result_type || "")
    .trim()
    .toLowerCase();
  const winner =
    row?.match_winner != null &&
    String(row.match_winner).trim() !== "" &&
    String(row.match_winner) !== "0";
  if (PLAYED_TYPES.has(raw) && (winner || officialScoreText(row))) return "played";
  if (!raw && winner) return "played";
  return null;
}

/**
 * Terminal archive row with no winner, and not a withdrawal.
 * Upcoming rows (no terminal result_type) are not gaps.
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 */
export function splitResultAbsences(rows) {
  /** @type {string[]} */
  const withdrawal = [];
  /** @type {string[]} */
  const ingestionGap = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?.id != null ? String(row.id) : "";
    if (!id) continue;
    const kind = officialFactKind(row);
    if (kind === "withdrawal") {
      withdrawal.push(id);
      continue;
    }
    const rt = String(row?.result_type || "")
      .trim()
      .toLowerCase();
    const winner =
      row?.match_winner != null &&
      String(row.match_winner).trim() !== "" &&
      String(row.match_winner) !== "0";
    if (PLAYED_TYPES.has(rt) && !winner) ingestionGap.push(id);
  }
  return { withdrawal, ingestionGap };
}

/**
 * A select error is not an empty row. Callers must fail the run instead of
 * treating a missing column as "match not found" or a score-less success.
 * @param {{ data?: unknown, error?: { message?: string } | null } | null | undefined} result
 */
export function matchLookupFromQuery(result) {
  if (!result || typeof result !== "object") {
    return { ok: false, error: "match select failed" };
  }
  if (result.error) {
    const message =
      result.error.message == null ? "" : String(result.error.message).trim();
    return { ok: false, error: message || "match select failed" };
  }
  return { ok: true, row: result.data ?? null };
}

/**
 * Fill a missing official score or fact kind. Never replace a conflicting
 * settled winner, void, score, or fact kind.
 *
 * @param {{
 *   settled_at?: string|null,
 *   winner_player_id?: string|null,
 *   voided?: boolean|null,
 *   official_score?: string|null,
 *   fact_kind?: string|null,
 * }} existing
 * @param {{
 *   winner_player_id?: string|null,
 *   voided?: boolean|null,
 *   official_score?: string|null,
 *   fact_kind?: string|null,
 * }} incoming
 */
export function mergeSettledFact(existing, incoming) {
  const ex = existing || {};
  const inc = incoming || {};
  const inVoid = Boolean(inc.voided);
  const inWinner = inVoid ? null : inc.winner_player_id ?? null;
  const exSettled =
    Boolean(ex.settled_at) && (Boolean(ex.winner_player_id) || Boolean(ex.voided));

  if (!exSettled) {
    return {
      action: "write",
      patch: {
        voided: inVoid,
        winner_player_id: inWinner,
        official_score: inc.official_score ?? null,
        fact_kind: inc.fact_kind ?? null,
      },
      conflicts: [],
    };
  }

  /** @type {string[]} */
  const conflicts = [];
  /** @type {Record<string, unknown>} */
  const patch = {};
  const exWinner = ex.winner_player_id ?? null;
  const exVoid = Boolean(ex.voided);
  if (exVoid !== inVoid || (exWinner ?? null) !== (inWinner ?? null)) {
    conflicts.push("winner");
  }
  const exScore = publishedScore(ex.official_score);
  const inScore = publishedScore(inc.official_score);
  if (!exScore && inScore) {
    patch.official_score = inScore;
  } else if (exScore && inScore && exScore !== inScore) {
    conflicts.push("score");
  }
  if (!ex.fact_kind && inc.fact_kind) {
    patch.fact_kind = inc.fact_kind;
  } else if (
    ex.fact_kind &&
    inc.fact_kind &&
    String(ex.fact_kind) !== String(inc.fact_kind)
  ) {
    conflicts.push("fact_kind");
  }

  if (conflicts.includes("winner")) {
    return { action: "conflict", patch: {}, conflicts };
  }
  if (Object.keys(patch).length) {
    return { action: "fill", patch, conflicts };
  }
  return { action: "noop", patch, conflicts };
}

/**
 * Why apply-results skipped a winner write. A score or fact-class
 * conflict is named even when no repair-run id exists to insert ops_events.
 *
 * @param {{ action?: string, conflicts?: string[] }|null|undefined} decision
 */
export function settledFactSkipReason(decision) {
  const conflicts = Array.isArray(decision?.conflicts) ? decision.conflicts : [];
  if (decision?.action === "conflict" || conflicts.includes("winner")) {
    return "winner conflict";
  }
  if (conflicts.includes("score")) return "score conflict";
  if (conflicts.includes("fact_kind")) return "fact kind conflict";
  return decision?.action === "fill" ? "filled missing fact" : "already settled";
}

/**
 * A REST confirmation removes the provisional live row after the official
 * winner, score, and parent advance. A winner conflict keeps that row.
 * The live branch does not call this.
 * @param {string | null | undefined} action
 */
export function clearsProvisionalLive(action) {
  return action === "write" || action === "fill" || action === "noop";
}
