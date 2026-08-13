#!/usr/bin/env node
/**
 * Set tournaments.lock_at from the Tennis API first timed main-draw ball.
 * Date-only fixtures are ignored (no invented kickoff).
 *
 * Usage (repo root):
 *   node scripts/sync-lock-at.mjs
 *   node scripts/sync-lock-at.mjs --dry-run
 *
 * Env: .env.provider (RAPIDAPI_KEY, RAPIDAPI_HOST)
 * DB: Supabase Management API via CLI token (same as apply-sql-migration.mjs)
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  createClient,
  firstMainDrawBall,
  getTournamentFixtures,
} from "@matchread/provider-rapidapi";

const projectRef = process.argv.includes("--project")
  ? process.argv[process.argv.indexOf("--project") + 1]
  : "opugihofwvunwkpcmboq";
const dryRun = process.argv.includes("--dry-run");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function readCliToken() {
  const ps1 = resolve(process.cwd(), "tmp-get-supabase-token.ps1");
  writeFileSync(
    ps1,
    `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredTok {
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern bool CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize;
    public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes;
    public IntPtr TargetAlias; public IntPtr UserName;
  }
  public static string Get(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return "";
    var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    byte[] bytes = new byte[c.CredentialBlobSize];
    Marshal.Copy(c.CredentialBlob, bytes, 0, c.CredentialBlobSize);
    CredFree(p);
    return Encoding.UTF8.GetString(bytes).Trim();
  }
}
'@
Write-Output ([CredTok]::Get('Supabase CLI:supabase'))
`
  );
  try {
    return execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { encoding: "utf8" }
    ).trim();
  } finally {
    try {
      unlinkSync(ps1);
    } catch {
      /* ignore */
    }
  }
}

async function runSql(token, query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const env = {
  ...loadEnvFile(resolve(process.cwd(), ".env.provider")),
  ...process.env,
};
const key = env.RAPIDAPI_KEY;
if (!key) {
  console.error("RAPIDAPI_KEY missing (.env.provider)");
  process.exit(1);
}

const token = readCliToken();
if (!token.startsWith("sbp_")) {
  console.error("Could not read Supabase CLI access token.");
  process.exit(1);
}

const rows = await runSql(
  token,
  `select ref, tour, provider_tournament_id, lock_at
   from public.tournaments
   where provider_tournament_id is not null
   order by starts_on nulls last, ref`
);
const tournaments = Array.isArray(rows) ? rows : rows?.data ?? [];
console.log("tournaments", tournaments.length);

const client = createClient({ key, host: env.RAPIDAPI_HOST });

for (const row of tournaments) {
  const ref = row.ref;
  const tour = row.tour === "wta" ? "wta" : "atp";
  const providerId = String(row.provider_tournament_id);
  try {
    const { fixtures } = await getTournamentFixtures(client, tour, providerId);
    const ball = firstMainDrawBall(fixtures);
    if (!ball) {
      console.log(ref, "no timed main-draw first ball — lock_at unchanged", row.lock_at);
      continue;
    }
    if (row.lock_at && new Date(row.lock_at).toISOString() === ball.scheduled_at) {
      console.log(ref, "lock_at already", ball.scheduled_at);
      continue;
    }
    console.log(ref, row.lock_at, "→", ball.scheduled_at, `(${fixtures.length} fixtures)`);
    if (dryRun) continue;
    await runSql(
      token,
      `update public.tournaments
       set lock_at = ${sqlLiteral(ball.scheduled_at)}::timestamptz
       where ref = ${sqlLiteral(ref)}`
    );
  } catch (err) {
    console.warn(ref, err instanceof Error ? err.message : err);
  }
}

console.log(dryRun ? "DRY RUN done" : "done");
