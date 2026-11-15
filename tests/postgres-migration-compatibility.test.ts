import test from "node:test";
import assert from "node:assert/strict";
import { isSupersededLegacyFortressMigration } from "../packages/finance/src/postgres-migrations.js";

test("legacy Fortress migrations are skipped only when the replacement schema exists", () => {
  for (const file of [
    "054_fortress_user_rls_hardening.sql",
    "055_fortress_user_data_objects.sql",
    "056_fortress_admin_user_data_rls.sql"
  ]) {
    assert.equal(isSupersededLegacyFortressMigration(file, false, true), true);
    assert.equal(isSupersededLegacyFortressMigration(file, true, true), false);
    assert.equal(isSupersededLegacyFortressMigration(file, false, false), false);
  }
});

test("unrelated migrations are never skipped by the Fortress compatibility guard", () => {
  assert.equal(isSupersededLegacyFortressMigration("057_future_migration.sql", false, true), false);
});
