#!/usr/bin/env node
/**
 * CI grep: public consumer routes must not read tournaments directly.
 * Allowlist: league home (historical), founder, migrate scripts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "apps/web");
const scanRoots = [
  join(root, "app"),
  join(root, "lib", "tournaments"),
];

const allowPath = (rel) => {
  if (rel.includes("founder")) return true;
  if (rel.includes("leagues") && rel.includes("[slug]") && !rel.includes("new")) {
    // League-scoped historical routes may still join tournaments.
    return true;
  }
  if (rel.includes("actions") && rel.includes("settlement")) return true;
  // Bracket save/submit resolve by id already; tournament lookup is eligibility-gated.
  if (rel === "app/actions/brackets.ts") return true;
  return false;
};

const pattern = /\.from\(\s*["']tournaments["']\s*\)/;
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
    const rel = relative(root, p).replace(/\\/g, "/");
    if (allowPath(rel)) continue;
    // calendar.ts may still reference tournaments in listVerifiedDrawTournamentIds — check separately
    const text = readFileSync(p, "utf8");
    if (!pattern.test(text)) continue;
    // Allow verified-draw helper and types-only mentions inside comments.
    if (rel === "lib/tournaments/calendar.ts") {
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!pattern.test(lines[i])) continue;
        // Internal helper may still scan tournaments for verified draws.
        const window = lines.slice(Math.max(0, i - 15), i + 1).join("\n");
        if (window.includes("listVerifiedDrawTournamentIds")) continue;
        offenders.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
      }
      continue;
    }
    offenders.push(rel);
  }
}

for (const r of scanRoots) walk(r);

// Explicit: list/get calendar must use public_calendar
const calendarSrc = readFileSync(
  join(root, "lib/tournaments/calendar.ts"),
  "utf8"
);
if (!calendarSrc.includes('from("public_calendar")')) {
  offenders.push("lib/tournaments/calendar.ts missing public_calendar reads");
}
const listFn = calendarSrc.match(
  /export async function listCalendarTournaments\([\s\S]*?\n\}/
);
const getFn = calendarSrc.match(
  /export async function getCalendarTournament\([\s\S]*?\n\}/
);
if (listFn && /from\("tournaments"\)/.test(listFn[0])) {
  offenders.push("listCalendarTournaments still reads tournaments");
}
if (getFn && /from\("tournaments"\)/.test(getFn[0])) {
  offenders.push("getCalendarTournament still reads tournaments");
}

if (offenders.length) {
  console.error("Consumer boundary CI grep failed:\n" + offenders.join("\n"));
  process.exit(1);
}
console.log("consumer-boundary grep ok");
