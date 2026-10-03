import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "pg";

export async function applyMigrations(client: Client, migrationDirectory: URL): Promise<void> {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
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
}