import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("migration 102 constrains agent-device binding to the same organization", async () => {
  const sql = await readFile(new URL("../migrations/102_microfinance_field_device_tenant_fk.sql", import.meta.url), "utf8");
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS ux_api_devices_organization_device/);
  assert.ok(sql.includes("FOREIGN KEY (organization_id, device_id)"));
  assert.ok(sql.includes("REFERENCES api_devices (organization_id, id)"));
});
