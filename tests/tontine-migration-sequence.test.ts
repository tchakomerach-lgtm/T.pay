import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

test("SQL migration numeric versions are unique and stable", async () => {
  const files = (await readdir("migrations")).filter(file => /^\d+_.+\.sql$/.test(file));
  const versions = files.map(file => file.slice(0, file.indexOf("_")));
  const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);
  assert.deepEqual([...new Set(duplicates)], [], "duplicate numeric migration prefixes collide in schema_migrations");
  for (const file of [
    "100_tontine_independent_rotation_payout.sql",
    "101_tontine_durability_callbacks.sql",
    "102_tontine_offline_operations.sql",
    "103_tontine_cases_refunds.sql",
    "104_tontine_economic_intelligence.sql",
    "105_tontine_governance.sql",
    "106_community_tontine_microfinance_management.sql",
    "107_community_tontine_microfinance_hardening.sql",
    "108_community_tontine_microfinance_maker_checker.sql",
    "109_community_tontine_mf_settlement_instructions.sql",
    "110_community_tontine_mf_settlement_audit.sql",
    "111_community_tontine_mf_maker_checker_constraints.sql",
    "112_community_tontine_mf_transition_guards.sql",
    "113_community_tontine_mf_settlement_actor_audit.sql",
    "114_tontine_composite_tenant_isolation.sql"
  ]) assert.ok(files.includes(file), "missing ordered tontine migration: " + file);
});
