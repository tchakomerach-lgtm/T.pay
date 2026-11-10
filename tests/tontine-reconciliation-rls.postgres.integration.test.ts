import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("P057.4.1 PostgreSQL forces RLS and hides an existing reconciliation row without organization context",
  {skip:!databaseUrl && "TPAY_DATABASE_URL is not configured"},async()=>{
    const client=new pg.Client({connectionString:databaseUrl});
    await client.connect();
    const organizationId=randomUUID();
    const receiptId=randomUUID();
    const findingId=randomUUID();
    const providerEventId="rls-"+randomUUID();
    const roleName="tpay_recon_rls_"+randomUUID().replace(/-/g,"");
    const now=new Date().toISOString();
    try{
      await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
      await client.query("BEGIN");

      // Seed a real row before switching to the restricted runtime role. An empty-table
      // assertion would pass even if the policy were ineffective.
      await client.query(
        "INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)",
        [organizationId,"P057.4.1 RLS integration fixture",now]
      );
      await client.query(
        `INSERT INTO tontine_provider_callback_receipts
          (id,organization_id,provider,provider_event_id,payload_sha256,signature_verified,
           received_at,state,payout_id,provider_reference,amount_minor,currency)
         VALUES ($1,$2,'tmoney',$3,$4,true,$5,'processed',$6,'rls-fixture',1000,'XOF')`,
        [receiptId,organizationId,providerEventId,"a".repeat(64),now,randomUUID()]
      );
      await client.query(
        `INSERT INTO tontine_reconciliation_findings
          (id,organization_id,provider,provider_event_id,classification,severity,callback_state,
           expected_amount_minor,observed_amount_minor,expected_currency,observed_currency,
           details,first_seen_at,last_checked_at,check_count)
         VALUES ($1,$2,'tmoney',$3,'amount_mismatch','critical','processed',1000,999,'XOF','XOF',
                 '{}'::jsonb,$4,$4,1)`,
        [findingId,organizationId,providerEventId,now]
      );

      const flags=await client.query(
        `SELECT c.relrowsecurity,c.relforcerowsecurity,
                EXISTS(SELECT 1 FROM pg_policies p
                  WHERE p.schemaname=current_schema()
                    AND p.tablename='tontine_reconciliation_findings'
                    AND p.policyname='tontine_reconciliation_findings_org_scope') AS policy_exists,
                to_regprocedure('tpay_current_organization_id()') IS NOT NULL AS context_function_exists
         FROM pg_class c WHERE c.oid='tontine_reconciliation_findings'::regclass`
      );
      assert.deepEqual(flags.rows[0],{
        relrowsecurity:true,relforcerowsecurity:true,policy_exists:true,context_function_exists:true
      });

      const ownerView=await client.query(
        "SELECT id FROM tontine_reconciliation_findings WHERE organization_id=$1 AND id=$2",
        [organizationId,findingId]
      );
      assert.equal(ownerView.rowCount,1,"fixture must exist before testing the restricted role");

      await client.query(`CREATE ROLE ${roleName} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
      await client.query(`GRANT EXECUTE ON FUNCTION tpay_current_organization_id() TO ${roleName}`);
      await client.query(`GRANT SELECT ON tontine_reconciliation_findings TO ${roleName}`);
      await client.query(`SET LOCAL ROLE ${roleName}`);

      const denied=await client.query(
        "SELECT id FROM tontine_reconciliation_findings WHERE id=$1",
        [findingId]
      );
      assert.equal(denied.rowCount,0,"a real tenant row must remain invisible when organization context is absent");

      await client.query("ROLLBACK");
    }catch(error){
      await client.query("ROLLBACK").catch(()=>undefined);
      throw error;
    }finally{
      await client.end();
    }
  });
