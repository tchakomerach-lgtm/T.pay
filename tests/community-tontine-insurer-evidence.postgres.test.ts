import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("CT-042 insurer evidence has forced tenant RLS, permissive scope, restrictive fence, and immutable trigger",{
  skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"
},async()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  await client.connect();
  try{
    await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    const table=await client.query<{relrowsecurity:boolean;relforcerowsecurity:boolean}>(
      "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='community_tontine_insurer_verification_evidence'::regclass"
    );
    assert.equal(table.rows[0]?.relrowsecurity,true);
    assert.equal(table.rows[0]?.relforcerowsecurity,true);
    const policies=await client.query<{policyname:string;permissive:string;qual:string|null;with_check:string|null}>(
      "SELECT policyname,permissive,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='community_tontine_insurer_verification_evidence'"
    );
    assert.equal(policies.rows.length,2);
    const permissive=policies.rows.find(row=>row.permissive==="PERMISSIVE");
    const restrictive=policies.rows.find(row=>row.permissive==="RESTRICTIVE");
    assert.ok(permissive);
    assert.ok(restrictive);
    for(const row of [permissive!,restrictive!]){
      assert.match(row.qual??"",/tpay_current_organization_id/);
      assert.match(row.with_check??"",/tpay_current_organization_id/);
    }
    const trigger=await client.query<{tgname:string}>(
      "SELECT tgname FROM pg_trigger WHERE tgrelid='community_tontine_insurer_verification_evidence'::regclass AND NOT tgisinternal"
    );
    assert.ok(trigger.rows.some(row=>row.tgname==="community_tontine_insurer_evidence_immutable_trigger"));
  }finally{
    await client.end();
  }
});
