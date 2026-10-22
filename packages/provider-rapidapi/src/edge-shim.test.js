/**
 * Edge loads this package through supabase/functions/_shared/rapidapi.js.
 * A name an Edge file imports but the shim does not re-export is an ESM
 * link error: the function fails to boot (BOOT_ERROR) before any request.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import * as provider from "./index.js";

const root = path.resolve(import.meta.dirname, "../../..");
const functionsDir = path.join(root, "supabase", "functions");
const shimFile = path.join(functionsDir, "_shared", "rapidapi.js");

/** Names inside `{ … }` of each matching import/export clause. */
function clauseNames(source, fromPattern) {
  const names = [];
  const re = new RegExp(`(?:import|export)\\s*\\{([^}]*)\\}\\s*from\\s*["']${fromPattern}["']`, "g");
  for (const match of source.matchAll(re)) {
    for (const part of match[1].split(",")) {
      const name = part.replace(/\/\/.*$/gm, "").trim().split(/\s+as\s+/)[0];
      if (name && !name.startsWith("type ")) names.push(name);
    }
  }
  return names;
}

function edgeSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...edgeSources(full));
    else if (/\.(ts|js)$/.test(entry.name) && full !== shimFile) out.push(full);
  }
  return out;
}

describe("Edge provider shim", () => {
  const shimNames = new Set(
    clauseNames(readFileSync(shimFile, "utf8"), "[./]*packages/provider-rapidapi/src/index\\.js")
  );

  it("re-exports only names the provider package exports", () => {
    assert.ok(shimNames.size > 0);
    const missing = [...shimNames].filter((name) => !(name in provider));
    assert.deepEqual(missing, []);
  });

  it("re-exports every name an Edge file imports from it", () => {
    const missing = [];
    for (const file of edgeSources(functionsDir)) {
      const wanted = clauseNames(readFileSync(file, "utf8"), "[./]*_shared/rapidapi\\.js");
      for (const name of wanted) {
        if (!shimNames.has(name)) missing.push(`${path.relative(root, file)}: ${name}`);
      }
    }
    assert.deepEqual(missing, []);
  });
});
