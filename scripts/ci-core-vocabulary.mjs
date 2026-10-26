#!/usr/bin/env node
/**
 * CI guard for the live domain in packages/core.
 *
 * The consequence engine returns domain fields only. Presentation (the Stage,
 * takeovers, colour, components) belongs to apps/web. Fails if a non-test
 * file under packages/core/src/live names a Stage state, a colour token or
 * hex colour, a class name, or imports React.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const dir = join(root, "packages/core/src/live");

function walk(path, acc) {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name)) acc.push(full);
  }
  return acc;
}

const forbidden = [
  { label: "Stage vocabulary", pattern: /\b(stage|takeover|urgent|cascade|reckoning)\b/i },
  { label: "colour token", pattern: /--mr-/ },
  { label: "hex colour", pattern: /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i },
  { label: "class name", pattern: /\bclassName\b/ },
  { label: "React import", pattern: /from\s+["']react(-dom)?["']/ },
  { label: "TSX file", pattern: null, file: /\.tsx$/ },
];

const failures = [];
const files = walk(dir, []);
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (rule.file && rule.file.test(file)) {
      failures.push(`${relative(root, file)}: ${rule.label}`);
      continue;
    }
    if (!rule.pattern) continue;
    text.split(/\r?\n/).forEach((line, index) => {
      if (rule.pattern.test(line)) {
        failures.push(`${relative(root, file)}:${index + 1}: ${rule.label}: ${line.trim()}`);
      }
    });
  }
}

if (failures.length) {
  console.error("core vocabulary guard failed:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`core vocabulary guard ok (${files.length} files)`);
