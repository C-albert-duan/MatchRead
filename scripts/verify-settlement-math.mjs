#!/usr/bin/env node
/**
 * Dry-run settlement math — no DB required.
 * Mirrors packages/core scoring + round structure for drawSize 128.
 *
 * Usage: node scripts/verify-settlement-math.mjs
 */

function maxBracketScore(drawSize) {
  if (drawSize < 2 || (drawSize & (drawSize - 1)) !== 0) {
    throw new Error("drawSize must be a power of 2 >= 2");
  }
  let total = 0;
  let w = 1;
  let matches = drawSize / 2;
  while (matches >= 1) {
    total += matches * w;
    if (matches === 1) {
      total += w; // champion bonus
      break;
    }
    w *= 2;
    matches /= 2;
  }
  return total;
}

function buildRoundStructureLength(drawSize) {
  if (drawSize < 2 || (drawSize & (drawSize - 1)) !== 0) {
    throw new Error("drawSize must be a power of 2 >= 2");
  }
  let remaining = drawSize;
  let rounds = 0;
  while (remaining >= 2) {
    rounds += 1;
    remaining /= 2;
  }
  return rounds;
}

const DRAW = 128;
const expectScore = 512;
const expectRounds = 7;

const score = maxBracketScore(DRAW);
const rounds = buildRoundStructureLength(DRAW);

let failed = false;

if (score !== expectScore) {
  console.error(`FAIL maxBracketScore(${DRAW}): got ${score}, want ${expectScore}`);
  failed = true;
} else {
  console.log(`OK  maxBracketScore(${DRAW}) === ${expectScore}`);
}

if (rounds !== expectRounds) {
  console.error(
    `FAIL buildRoundStructure(${DRAW}).length: got ${rounds}, want ${expectRounds}`
  );
  failed = true;
} else {
  console.log(`OK  buildRoundStructure(${DRAW}).length === ${expectRounds}`);
}

if (failed) {
  process.exit(1);
}

console.log("Settlement math dry-run passed.");
