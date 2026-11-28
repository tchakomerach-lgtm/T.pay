import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("P057.4.1 PostgreSQL forces reconciliation RLS and enforces no-context, same-org and cross-org boundaries",
  { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const receiptId = randomUUID();
    const findingId = randomUUID();
    const providerEventId = "rls-" + randomUUID();
    const roleName = "tpay_recon_rls_" + randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    let roleCreated = false;
    let transactionOpen = false;
    try {
      await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
      // PostgreSQL CREATE ROLE cannot run inside a transaction block.
      await client.query(`CREATE ROLE ${roleName} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      roleCreated = true;
      await client.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
      await client.query(`GRANT EXECUTE ON FUNCTION public.tpay_current_organization_id() TO ${roleName}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE ON tontine_reconciliation_findings TO ${roleName}`);

      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(
        "INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3),($4,$5,'active',$3)",
        [organizationId, "P057.4 RLS fixture A", now, otherOrganizationId, "P057.4 RLS fixture B"]
      );
      await client.query(
        `INSERT INTO tontine_provider_callback_receipts
          (id,organization_id,provider,provider_event_id,payload_sha256,signature_verified,
           received_at,state,payout_id,provider_reference,amount_minor,currency)
         VALUES ($1,$2,'tmoney',$3,$4,true,$5,'processed',$6,'rls-fixture',1000,'XOF')`,
        [receiptId, organizationId, providerEventId, "a".repeat(64), now, randomUUID()]
      );
      await client.query(
        `INSERT INTO tontine_reconciliation_findings
          (id,organization_id,provider,provider_event_id,classification,severity,callback_state,
           expected_amount_minor,observed_amount_minor,expected_currency,observed_currency,
           details,first_seen_at,last_checked_at,check_count)
         VALUES ($1,$2,'tmoney',$3,'amount_mismatch','critical','processed',1000,999,'XOF','XOF',
                 '{}'::jsonb,$4,$4,1)`,
        [findingId, organizationId, providerEventId, now]
      );

      const flags = await client.query(
        `SELECT c.relrowsecurity,c.relforcerowsecurity,
                EXISTS(SELECT 1 FROM pg_policies p
                  WHERE p.schemaname=current_schema()
                    AND p.tablename='tontine_reconciliation_findings'
                    AND p.policyname='tontine_reconciliation_findings_org_scope') AS policy_exists,
                to_regprocedure('public.tpay_current_organization_id()') IS NOT NULL AS context_function_exists
         FROM pg_class c WHERE c.oid='tontine_reconciliation_findings'::regclass`
      );
      assert.deepEqual(flags.rows[0], {
        relrowsecurity: true, relforcerowsecurity: true, policy_exists: true, context_function_exists: true
      });

      await client.query("SET LOCAL ROLE " + roleName);
      const noContext = await client.query("SELECT id FROM tontine_reconciliation_findings WHERE id=$1", [findingId]);
      assert.equal(noContext.rowCount, 0, "missing organization context must deny the row");

      await client.query("SELECT set_config('tpay.organization_id',$1,true)", [organizationId]);
      const sameOrg = await client.query("SELECT id FROM tontine_reconciliation_findings WHERE id=$1", [findingId]);
      assert.equal(sameOrg.rowCount, 1, "authenticated organization context must expose its own row");

      await client.query("SELECT set_config('tpay.organization_id',$1,true)", [otherOrganizationId]);
      const crossOrg = await client.query("SELECT id FROM tontine_reconciliation_findings WHERE id=$1", [findingId]);
      assert.equal(crossOrg.rowCount, 0, "another organization must not see the row");

      await client.query("SELECT set_config('tpay.organization_id',$1,true)", [organizationId]);
      await assert.rejects(
        client.query("UPDATE tontine_reconciliation_findings SET organization_id=$2 WHERE organization_id=$1 AND id=$3",
          [organizationId, otherOrganizationId, findingId]),
        /row-level security|violates row-level security/i
      );
      const deletePrivilege = await client.query(
        "SELECT has_table_privilege(current_user,'tontine_reconciliation_findings','DELETE') AS allowed"
      );
      assert.equal(deletePrivilege.rows[0]?.allowed, false, "runtime role must not receive DELETE");
      await client.query("ROLLBACK");
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
      transactionOpen = false;
      throw error;
    } finally {
      if (roleCreated) await client.query(`DROP ROLE IF EXISTS ${roleName}`).catch(() => undefined);
      await client.end();
    }
  });
