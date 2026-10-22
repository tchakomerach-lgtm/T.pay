import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("migration 103 preserves binding history and permits re-enrollment after revocation", async () => {
  const sql = await readFile(new URL("../migrations/103_microfinance_field_binding_history.sql", import.meta.url), "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS binding_id uuid/);
  assert.match(sql, /PRIMARY KEY \(binding_id\)/);
  assert.match(sql, /DROP CONSTRAINT/);
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS ux_customer_field_agent_binding_active/);
  assert.match(sql, /WHERE active = true/);
  assert.match(sql, /idx_customer_field_agent_binding_history/);
});
