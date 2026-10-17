/**
 * Match session and court labels copied from a provider row.
 * Captured live, fixture, and info bodies have no session field.
 * startTimestamp, dateOnly, and startTime are not a day or night label.
 * A surface name is not a court.
 */

const SURFACES = new Set([
  "hard",
  "clay",
  "grass",
  "carpet",
  "indoor",
  "outdoor",
  "i.hard",
]);

/**
 * @param {unknown} row
 * @returns {"day"|"night"|null}
 */
export function parseMatchSession(row) {
  if (!row || typeof row !== "object") return null;
  const source = /** @type {Record<string, unknown>} */ (row);
  const raw =
    source.session ??
    source.sessionType ??
    source.dayNight ??
    source.day_night;
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (value === "day" || value === "day_session") return "day";
  if (value === "night" || value === "night_session") return "night";
  return null;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function courtLabel(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object") {
    const named = /** @type {Record<string, unknown>} */ (value);
    return courtLabel(named.name ?? named.Name ?? null);
  }
  const text = String(value).trim();
  if (!text || SURFACES.has(text.toLowerCase())) return null;
  return text;
}

/**
 * Court name or number published on the match. Null when absent.
 * @param {unknown} row
 * @returns {string|null}
 */
export function parseMatchCourt(row) {
  if (!row || typeof row !== "object") return null;
  const source = /** @type {Record<string, unknown>} */ (row);
  const named =
    source.courtName ??
    source.court_name ??
    source.matchCourt ??
    source.courtNumber ??
    source.court_number;
  const fromNamed = courtLabel(named);
  if (fromNamed) return fromNamed;
  if (typeof source.court === "string" || typeof source.court === "number") {
    return courtLabel(source.court);
  }
  return null;
}
