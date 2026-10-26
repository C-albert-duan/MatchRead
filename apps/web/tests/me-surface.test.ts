import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const web = path.resolve(import.meta.dirname, "..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

test("the Stage never renders on bracket entry", () => {
  const entry = [
    ...walk(path.join(web, "app", "enter")),
    ...walk(path.join(web, "app", "leagues", "[slug]", "t", "[ref]", "bracket")),
  ];
  assert.ok(entry.length > 0);
  for (const file of entry) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/components\/me\//.test(source), `${path.relative(web, file)} imports a My Tennis component`);
  }
});

test("/me paints on the server: no loading shell and no client page", () => {
  assert.equal(existsSync(path.join(web, "app", "me", "loading.tsx")), false);
  const page = readFileSync(path.join(web, "app", "me", "page.tsx"), "utf8");
  assert.ok(!page.startsWith('"use client"'));
  for (const name of ["Stage.tsx", "MatchRow.tsx", "CeilingTriad.tsx"]) {
    const source = readFileSync(path.join(web, "components", "me", name), "utf8");
    assert.ok(!source.startsWith('"use client"'), `${name} stays a server component`);
  }
});

test("only the Stage headline is a live region, so score ticks are not announced", () => {
  const stage = readFileSync(path.join(web, "components", "me", "Stage.tsx"), "utf8");
  assert.equal(stage.match(/aria-live=/g)?.length, 1);
  const row = readFileSync(path.join(web, "components", "me", "MatchRow.tsx"), "utf8");
  assert.ok(!/aria-live=/.test(row));
  assert.ok(!/autoFocus|\.focus\(/.test(stage + row));
});
