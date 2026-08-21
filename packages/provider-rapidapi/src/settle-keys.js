/** Shared match key helper (avoid pulling TS core into Deno/Node provider). */
export function matchKey(round, indexInRound) {
  return `r${round}-m${indexInRound}`;
}

export function parseMatchKey(key) {
  const m = String(key || "").match(/^r(\d+)-m(\d+)$/);
  if (!m) return null;
  return { round: Number(m[1]), indexInRound: Number(m[2]) };
}
