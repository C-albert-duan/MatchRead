#!/usr/bin/env node
/**
 * Apply e2e-live-setup.sql or e2e-live-cleanup.sql via Supabase Management API.
 *
 *   node scripts/e2e-live-pipeline.mjs setup
 *   node scripts/e2e-live-pipeline.mjs cleanup
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const mode = (process.argv[2] || "").trim();
if (mode !== "setup" && mode !== "cleanup") {
  console.error("Usage: node scripts/e2e-live-pipeline.mjs setup|cleanup");
  process.exit(1);
}

const projectRef = process.env.SUPABASE_PROJECT_REF || "opugihofwvunwkpcmboq";
const sqlPath = resolve(
  process.cwd(),
  mode === "setup" ? "scripts/e2e-live-setup.sql" : "scripts/e2e-live-cleanup.sql"
);

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
  const token = execFileSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
    { encoding: "utf8" }
  ).trim();
  if (!token.startsWith("sbp_")) {
    console.error("Could not read Supabase CLI access token.");
    process.exit(1);
  }
  const sql = readFileSync(sqlPath, "utf8");
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  console.log("status", res.status);
  console.log(text.slice(0, 800));
  if (!res.ok) process.exit(1);
  console.log("OK —", mode, sqlPath);
} finally {
  if (existsSync(ps1)) unlinkSync(ps1);
}
