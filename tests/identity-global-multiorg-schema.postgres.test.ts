import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;
const expectedTables = [
  "tpay_tenants",
  "tpay_organization_tenants",
  "identity_subjects",
  "identity_actor_links",
  "identity_tenant_memberships",
  "identity_organization_memberships",
  "identity_permission_grants",
  "identity_sessions",
  "identity_audit"
];

test("global identity schema is installed with FORCE RLS and fail-closed tenant context", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured"
}, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const tables = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
      [expectedTables]
    );
    assert.equal(tables.rows.length, expectedTables.length);
    for (const table of tables.rows) {
      assert.equal(table.relrowsecurity, true, table.relname + " must have RLS enabled");
      assert.equal(table.relforcerowsecurity, true, table.relname + " must FORCE RLS");
    }

    const policies = await client.query<{ tablename: string; policyname: string }>(
      `SELECT tablename,policyname FROM pg_policies
       WHERE schemaname='public' AND tablename=ANY($1::text[])`,
      [expectedTables]
    );
    for (const table of expectedTables) {
      assert.ok(policies.rows.some(row => row.tablename === table),
        "missing default-deny or explicit policy metadata for " + table);
    }

    await client.query("RESET tpay.tenant_id");
    const absent = await client.query("SELECT public.tpay_current_tenant_id() AS tenant_id");
    assert.equal(absent.rows[0]?.tenant_id, null, "missing tenant context must fail closed");

    const tenantId = "identity-schema-test-tenant";
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('tpay.tenant_id',$1,true)", [tenantId]);
      const scoped = await client.query("SELECT public.tpay_current_tenant_id() AS tenant_id");
      assert.equal(scoped.rows[0]?.tenant_id, tenantId);
    } finally {
      await client.query("ROLLBACK");
    }

    const immutable = await client.query<{ trigger_name: string; event_manipulation: string }>(
      `SELECT DISTINCT trigger_name,event_manipulation FROM information_schema.triggers
       WHERE event_object_schema='public' AND event_object_table='identity_audit'
         AND trigger_name='trg_identity_audit_immutable'`
    );
    assert.deepEqual(
      immutable.rows.map(row => row.event_manipulation).sort(),
      ["DELETE", "UPDATE"],
      "identity audit must reject both UPDATE and DELETE mutations"
    );

    const sessionGuard = await client.query<{ trigger_name: string }>(
      `SELECT trigger_name FROM information_schema.triggers
       WHERE event_object_schema='public' AND event_object_table='identity_sessions'
         AND trigger_name='trg_identity_session_actor_binding'`
    );
    assert.equal(sessionGuard.rows.length, 1, "identity sessions must bind to the same subject, actor and organization");
  } finally {
    await client.end();
  }
});
