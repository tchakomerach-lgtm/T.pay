import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const migrationRunner = resolve(process.cwd(), "dist/scripts/migrate.js");

function runMigrationRunner(overrides: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [migrationRunner], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...overrides }
  });
}

test("migration runner rejects plaintext connections to non-loopback hosts", () => {
  const result = runMigrationRunner({
    TPAY_MIGRATION_DATABASE_URL: "postgresql://user:password@db.example.com:5432/tpay",
    TPAY_MIGRATION_DATABASE_SSL: "disable",
    TPAY_ALLOW_INSECURE_LOCAL_DB: "true",
    TPAY_ALLOW_LOCAL_TEST_SEED: "true"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TPAY_MIGRATION_DATABASE_INSECURE_MODE_LOCALHOST_ONLY/);
});

test("migration runner rejects plaintext mode unless both explicit local-test flags are set", () => {
  const result = runMigrationRunner({
    TPAY_MIGRATION_DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/tpay",
    TPAY_MIGRATION_DATABASE_SSL: "disable",
    TPAY_ALLOW_INSECURE_LOCAL_DB: "true",
    TPAY_ALLOW_LOCAL_TEST_SEED: "false"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TPAY_MIGRATION_DATABASE_TLS_REQUIRED/);
});
