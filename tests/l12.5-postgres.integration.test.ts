import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {PostgresOperationalRecoveryRepository} from "../packages/operations/src/operational-recovery.js";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("L12.5 PostgreSQL admits exactly one worker for a reconciliation job", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
 const setup=new pg.Client({connectionString:databaseUrl}); const a=new pg.Client({connectionString:databaseUrl}); const b=new pg.Client({connectionString:databaseUrl});
 await Promise.all([setup.connect(),a.connect(),b.connect()]);
 const org=randomUUID(), job=randomUUID(), now=new Date().toISOString(), hash="e".repeat(64);
 try{
  await applyMigrations(setup,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  await setup.query("INSERT INTO organizations(id,name,status,created_at) VALUES($1,'L12.5 concurrency','active',$2)",[org,now]);
  await setup.query("INSERT INTO operational_reconciliation_jobs(id,organization_id,idempotency_key,scope_type,scope_ref,status,attempt_count,next_attempt_at,evidence_hash,created_at,updated_at) VALUES($1,$2,$3,'provider','tmoney','queued',0,$4::timestamptz,$5,$4::timestamptz,$4::timestamptz)",[job,org,"reconcile-"+randomUUID(),now,hash]);
  const ra=new PostgresOperationalRecoveryRepository(a), rb=new PostgresOperationalRecoveryRepository(b);
  const results=await Promise.all([ra.claimDue(org,"worker-a",now),rb.claimDue(org,"worker-b",now)]);
  assert.equal(results.filter(Boolean).length,1);
  const state=await setup.query("SELECT status,attempt_count,correlation_id FROM operational_reconciliation_jobs WHERE id=$1",[job]);
  assert.equal(state.rows[0]?.status,"running"); assert.equal(state.rows[0]?.attempt_count,"1");
 } finally {
  await setup.query("DELETE FROM operational_reconciliation_jobs WHERE organization_id=$1",[org]);
  await setup.query("DELETE FROM organizations WHERE id=$1",[org]);
  await Promise.all([setup.end(),a.end(),b.end()]);
 }
});

test("L12.5 PostgreSQL ignores stale DR epochs", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
 const client=new pg.Client({connectionString:databaseUrl}); await client.connect();
 const service="ledger-"+randomUUID(), now=new Date().toISOString(), hash="f".repeat(64);
 try{
  await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const r=new PostgresOperationalRecoveryRepository(client);
  await r.setDrState({service,state:"failed_over",epoch:2n,changedAt:now,evidenceHash:hash});
  await r.setDrState({service,state:"healthy",epoch:1n,changedAt:now,evidenceHash:hash});
  const row=await client.query("SELECT state,epoch FROM operational_dr_states WHERE service=$1",[service]);
  assert.equal(row.rows[0]?.state,"failed_over"); assert.equal(row.rows[0]?.epoch,"2");
 } finally {
  await client.query("DELETE FROM operational_dr_states WHERE service=$1",[service]); await client.end();
 }
});
