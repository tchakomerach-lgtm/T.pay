import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;
const DATABASE_URL = process.env.TPAY_DATABASE_URL;
if (!DATABASE_URL) throw new Error("TPAY_DATABASE_URL_REQUIRED");

const migrationDirectory = new URL("../migrations/", import.meta.url);

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await readdir(migrationDirectory)).filter(file => /^\d+_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const version = file.slice(0, file.indexOf("_"));
      const existing = await client.query<{ version: string }>("SELECT version FROM schema_migrations WHERE version = $1", [version]);
      if (existing.rowCount !== 0) continue;
      const sql = await readFile(join(migrationDirectory.pathname, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

await main();