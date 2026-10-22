/**
 * Private workspace packages are not on the npm registry.
 * Edge must load them by relative path or import-map file, never `npm:`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function privateWorkspaceNames(root) {
  const dir = join(root, "packages");
  const names = [];
  for (const entry of readdirSync(dir)) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(join(dir, entry, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (pkg.private === true && typeof pkg.name === "string" && pkg.name) {
      names.push(pkg.name);
    }
  }
  return names;
}

/** @returns {{ name: string, range: string | null } | null} */
export function unpublishedWorkspaceNpmSpecifier(spec, names) {
  const match = /^npm:([^@\s]+|@[^@\s]+)(?:@(.+))?$/.exec(String(spec).trim());
  if (!match) return null;
  const name = match[1];
  if (!names.includes(name)) return null;
  return { name, range: match[2] ?? null };
}

function quotedNpmSpecs(text) {
  const specs = [];
  const re = /['"](npm:[^'"]+)['"]/g;
  let hit;
  while ((hit = re.exec(text))) specs.push(hit[1]);
  return specs;
}

function walkSource(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      walkSource(path, out);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|json)$/.test(name)) continue;
    out.push(path);
  }
}

/**
 * @returns {string[]} human-readable hits. Empty means Edge does not ask the
 * registry for a private workspace package.
 */
export function edgeRegistrySpecifiers(root, names = privateWorkspaceNames(root)) {
  const functionsDir = join(root, "supabase", "functions");
  const files = [];
  walkSource(functionsDir, files);
  const offenders = [];
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    for (const spec of quotedNpmSpecs(text)) {
      const hit = unpublishedWorkspaceNpmSpecifier(spec, names);
      if (!hit) continue;
      const rel = path.slice(root.length + 1).replaceAll("\\", "/");
      const range = hit.range ? `@${hit.range}` : "";
      offenders.push(`${rel}: ${hit.name}${range}`);
    }
  }
  return offenders;
}
