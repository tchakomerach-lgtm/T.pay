import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("P057.4.1 PostgreSQL forces RLS and denies reconciliation rows without organization context",
  {skip:!databaseUrl && "TPAY_DATABASE_URL is not configured"},async()=>{
    const client=new pg.Client({connectionString:databaseUrl});
    await client.connect();
    try{
      await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
      await client.query("BEGIN");
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

      await client.query("CREATE ROLE tpay_reconciliation_rls_test NOLOGIN NOSUPERUSER NOBYPASSRLS");
      await client.query("GRANT USAGE ON SCHEMA public TO tpay_reconciliation_rls_test");
      await client.query("GRANT EXECUTE ON FUNCTION tpay_current_organization_id() TO tpay_reconciliation_rls_test");
      await client.query("GRANT SELECT ON tontine_reconciliation_findings TO tpay_reconciliation_rls_test");
      await client.query("SET LOCAL ROLE tpay_reconciliation_rls_test");
      const denied=await client.query("SELECT id FROM tontine_reconciliation_findings");
      assert.equal(denied.rowCount,0,"missing organization context must expose no reconciliation rows");
      await client.query("ROLLBACK");
    }catch(error){
      await client.query("ROLLBACK").catch(()=>undefined);
      throw error;
    }finally{
      await client.end();
    }
  });
