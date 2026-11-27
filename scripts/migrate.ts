import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const DATABASE_URL = process.env.TPAY_MIGRATION_DATABASE_URL?.trim();
if (!DATABASE_URL) throw new Error("TPAY_MIGRATION_DATABASE_URL_REQUIRED");

const sslMode = process.env.TPAY_MIGRATION_DATABASE_SSL ?? "require";
const localInsecureDb =
  process.env.TPAY_ALLOW_INSECURE_LOCAL_DB === "true" &&
  process.env.TPAY_ALLOW_LOCAL_TEST_SEED === "true";

if (sslMode !== "require" && !(sslMode === "disable" && localInsecureDb)) {
  throw new Error("TPAY_MIGRATION_DATABASE_TLS_REQUIRED");
}

// The paired opt-in flags are not sufficient by themselves: they can be
// accidentally copied into a hosted environment. Plaintext is permitted
// only when the connection URL explicitly targets a loopback host.
let migrationUrl: URL;
try {
  migrationUrl = new URL(DATABASE_URL);
} catch {
  throw new Error("TPAY_MIGRATION_DATABASE_URL_INVALID");
}
if (migrationUrl.protocol !== "postgres:" && migrationUrl.protocol !== "postgresql:") {
  throw new Error("TPAY_MIGRATION_DATABASE_URL_INVALID");
}
const migrationHost = migrationUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
const isLoopbackHost =
  migrationHost === "localhost" ||
  migrationHost === "127.0.0.1" ||
  migrationHost === "::1";

if (sslMode === "disable" && (!localInsecureDb || !isLoopbackHost)) {
  throw new Error("TPAY_MIGRATION_DATABASE_INSECURE_MODE_LOCALHOST_ONLY");
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: sslMode === "require" ? { rejectUnauthorized: true } : undefined
});

await client.connect();
try {
  await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
} finally {
  await client.end();
}
