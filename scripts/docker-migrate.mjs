/**
 * Apply supabase/migrations/*.sql in lexical order via DATABASE_URL.
 * Tracks applied files in schema_migrations (created if missing).
 *
 * Env:
 *   DATABASE_URL   — required (Postgres connection string; prefer pooler + ssl)
 *   MIGRATIONS_DIR — default: ./migrations (Docker) or ../supabase/migrations
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = process.env.MIGRATIONS_DIR
  ? path.resolve(process.env.MIGRATIONS_DIR)
  : path.resolve(here, "../supabase/migrations");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.error(`No .sql files in ${migrationsDir}`);
    process.exit(1);
  }

  const { rows } = await client.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.filename));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`apply ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran += 1;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`failed ${file}:`, err.message);
      process.exit(1);
    }
  }

  console.log(`done — ${ran} applied, ${files.length - ran} already present`);
} finally {
  await client.end();
}
