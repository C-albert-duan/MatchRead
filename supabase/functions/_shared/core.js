/** Edge copy of @matchread/core grading (Deno cannot follow package TS imports).
 * Player identity is UUID (`players.id`), not legacy string refs.
 */

export function matchKey(round, indexInRound) {
  return `r${round}-m${indexInRound}`;
}

export function parseMatchKey(key) {
  const m = String(key || "").match(/^r(\d+)-m(\d+)$/);
  if (!m) return null;
  return { round: Number(m[1]), indexInRound: Number(m[2]) };
}

export function buildRoundStructure(drawSize) {
  if (drawSize < 2 || (drawSize & (drawSize - 1)) !== 0) {
    throw new Error("drawSize must be a power of 2 >= 2");
  }
  const rounds = [];
  let remaining = drawSize;
  let index = 0;
  let matchNumber = 1;
  while (remaining >= 2) {
    const count = remaining / 2;
    const matches = [];
    for (let m = 0; m < count; m++) {
      matches.push({
        round: index,
        indexInRound: m,
        matchNumber: matchNumber++,
        key: matchKey(index, m),
      });
    }
    rounds.push({ index, matches });
    remaining /= 2;
    index++;
  }
  return rounds;
}

export function roundWeight(roundsFromFirst) {
  return 2 ** roundsFromFirst;
}

export function maxBracketScore(drawSize) {
  if (drawSize < 2 || (drawSize & (drawSize - 1)) !== 0) {
    throw new Error("drawSize must be a power of 2 >= 2");
  }
  let total = 0;
  let w = 1;
  let matches = drawSize / 2;
  while (matches >= 1) {
    total += matches * w;
    if (matches === 1) {
      total += w;
      break;
    }
    w *= 2;
    matches /= 2;
  }
  return total;
}

/** Players known to be out after the matches decided through `through` (see core grade.ts). */
export function knownEliminated(drawSize, picks, official, through) {
  const out = new Set();
  for (const round of buildRoundStructure(drawSize)) {
    if (round.index > through) break;
    for (const match of round.matches) {
      const o = official[match.key];
      const winner = o?.winnerPlayerId;
      if (!winner || o?.voided) continue;
      const pick = picks[match.key];
      if (pick && pick !== winner) out.add(pick);
      if (round.index === 0) continue;
      for (const feeder of [match.indexInRound * 2, match.indexInRound * 2 + 1]) {
        const f = official[matchKey(round.index - 1, feeder)];
        if (f?.winnerPlayerId && !f.voided && f.winnerPlayerId !== winner) out.add(f.winnerPlayerId);
      }
    }
  }
  return out;
}

export function computeAlive(drawSize, official, through) {
  const rounds = buildRoundStructure(drawSize);
  const alive = new Set();
  if (through < 0) return alive;
  for (let r = through; r >= 0; r--) {
    for (const match of rounds[r].matches) {
      const o = official[match.key];
      if (!o?.winnerPlayerId || o.voided) continue;
      if (r === through) {
        alive.add(o.winnerPlayerId);
        continue;
      }
      const childKey = matchKey(r + 1, Math.floor(match.indexInRound / 2));
      const child = official[childKey];
      if (!child?.winnerPlayerId && !child?.voided) {
        alive.add(o.winnerPlayerId);
      }
    }
  }
  return alive;
}

/**
 * @param {{
 *   drawSize: number,
 *   picks: Record<string, string>,
 *   official: Record<string, { winnerPlayerId: string | null, voided?: boolean }>,
 *   throughRound?: number,
 * }} input
 * picks / winners are `players.id` UUID strings; keys are `r{R}-m{I}`.
 */
export function gradeBracket(input) {
  const { drawSize, picks, official } = input;
  const rounds = buildRoundStructure(drawSize);
  const lastRound = rounds.length - 1;
  const championBonus = roundWeight(lastRound);
  const maxScore = maxBracketScore(drawSize);

  let furthest = -1;
  for (const round of rounds) {
    for (const match of round.matches) {
      const o = official[match.key];
      if (o && (o.voided || o.winnerPlayerId)) {
        furthest = Math.max(furthest, round.index);
      }
    }
  }
  const through =
    input.throughRound !== undefined
      ? Math.min(input.throughRound, lastRound)
      : furthest;

  let score = 0;
  let correct = 0;
  let incorrect = 0;
  let voided = 0;

  for (const round of rounds) {
    if (round.index > through) break;
    const w = roundWeight(round.index);
    for (const match of round.matches) {
      const o = official[match.key];
      const mine = picks[match.key];
      if (!o || (!o.voided && !o.winnerPlayerId) || !mine) continue;
      if (o.voided) {
        voided++;
        continue;
      }
      if (o.winnerPlayerId === mine) {
        score += w;
        correct++;
      } else {
        incorrect++;
      }
    }
  }

  const finalKey = matchKey(lastRound, 0);
  const officialChampion = official[finalKey]?.winnerPlayerId ?? null;
  const myChampion = picks[finalKey] ?? null;
  if (
    officialChampion &&
    myChampion &&
    officialChampion === myChampion &&
    !official[finalKey]?.voided
  ) {
    score += championBonus;
  }

  // Same rule as packages/core grade.ts (V3-M4-DOD F-3).
  const out = knownEliminated(drawSize, picks, official, through);
  const open = (key, round) => {
    const o = official[key];
    if (o?.voided) return false;
    return round > through || !o?.winnerPlayerId;
  };
  let upside = 0;
  for (const round of rounds) {
    const w = roundWeight(round.index);
    for (const match of round.matches) {
      const pick = picks[match.key];
      if (pick && !out.has(pick) && open(match.key, round.index)) upside += w;
    }
  }
  if (myChampion && !out.has(myChampion) && open(finalKey, lastRound)) {
    upside += championBonus;
  }

  return {
    score,
    correct,
    incorrect,
    voided,
    upside,
    championPlayerId: myChampion,
    championAlive: myChampion ? !out.has(myChampion) : null,
    maxScore,
  };
}

export function seasonPoints(score, maxScore, weight) {
  if (maxScore <= 0) return 0;
  return Math.round((1000 * score * weight) / maxScore);
}

export function rankRows(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.tieBreak.localeCompare(b.tieBreak);
  });
  return sorted.map((row, i) => ({ ...row, position: i + 1 }));
}
