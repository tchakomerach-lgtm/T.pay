import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const DATABASE_URL = process.env.TPAY_DATABASE_URL;
if (!DATABASE_URL) throw new Error("TPAY_DATABASE_URL_REQUIRED");

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await applyMigrations(client, new URL("../migrations/", import.meta.url));
} finally {
  await client.end();
}