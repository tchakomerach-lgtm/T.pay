import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const migration = readFileSync("migrations/118_tontine_governance_immutability.sql", "utf8");
test("community tontine governance stores a canonical JSON proposal payload", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(migration, /jsonb_typeof\(payload\)='object'/);
});
test("governance policy versions are strictly monotonic and scope-bound", () => {
  assert.match(migration, /NEW\.policy_version<>OLD\.policy_version\+1/);
  assert.match(migration, /TONTINE_GOVERNANCE_POLICY_SCOPE_IMMUTABLE/);
  assert.match(migration, /NEW\.effective_at<=OLD\.effective_at/);
});
test("proposal content and policy snapshots cannot be rewritten after opening", () => {
  assert.match(migration, /NEW\.payload<>OLD\.payload/);
  assert.match(migration, /NEW\.quorum_percent_snapshot IS DISTINCT FROM OLD\.quorum_percent_snapshot/);
  assert.match(migration, /TONTINE_GOVERNANCE_PROPOSAL_SNAPSHOT_IMMUTABLE/);
  assert.match(migration, /TONTINE_GOVERNANCE_PROPOSAL_FINAL_STATE_IMMUTABLE/);
});
