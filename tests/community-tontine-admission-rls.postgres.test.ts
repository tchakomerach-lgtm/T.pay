import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("Community Tontine admission tables enable organization-scoped PostgreSQL RLS", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured"
}, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const expected = [
      ["community_tontine_candidates", "community_tontine_candidates_org_scope"],
      ["community_tontine_consents", "community_tontine_consents_org_scope"],
      ["community_tontine_trust_attestations", "community_tontine_attestations_org_scope"],
      ["community_tontine_admission_audit", "community_tontine_admission_audit_org_scope"],
      ["community_tontine_launch_snapshots", "community_tontine_launch_snapshots_org_scope"]
    ];
    const tables = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
      [expected.map(([table]) => table)]
    );
    assert.equal(tables.rows.length, expected.length);
    for (const table of tables.rows) {
      assert.equal(table.relrowsecurity, true, table.relname + " must have RLS enabled");
    }

    const policies = await client.query<{
      tablename: string;
      policyname: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `SELECT tablename,policyname,qual,with_check
       FROM pg_policies
       WHERE schemaname='public' AND policyname=ANY($1::text[])`,
      [expected.map(([, policy]) => policy)]
    );
    assert.equal(policies.rows.length, expected.length);
    for (const [table, policy] of expected) {
      const row = policies.rows.find(item => item.tablename === table && item.policyname === policy);
      assert.ok(row, "missing organization RLS policy " + policy);
      assert.match(row.qual ?? "", /tpay_current_organization_id/);
      assert.match(row.with_check ?? "", /tpay_current_organization_id/);
    }
  } finally {
    await client.end();
  }
});
