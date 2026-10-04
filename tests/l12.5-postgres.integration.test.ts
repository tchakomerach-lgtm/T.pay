import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {PostgresOperationalReconciliationRepository} from "../packages/operations/src/reconciliation.js";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("L12.5 PostgreSQL concurrent reconciliation exception upsert remains one exception", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
 const setup=new pg.Client({connectionString:databaseUrl}); const a=new pg.Client({connectionString:databaseUrl}); const b=new pg.Client({connectionString:databaseUrl});
 await Promise.all([setup.connect(),a.connect(),b.connect()]);
 const runId=randomUUID(), key="provider-mismatch-"+randomUUID(), now=new Date().toISOString(), hash="d".repeat(64);
 try{
  await applyMigrations(setup,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const repoA=new PostgresOperationalReconciliationRepository(a), repoB=new PostgresOperationalReconciliationRepository(b);
  await setup.query("INSERT INTO operational_reconciliation_runs(id,scope,status,correlation_id,started_at,mismatch_count,evidence_hash) VALUES($1,'provider','started',$2,$3::timestamptz,0,$4)",[runId,randomUUID(),now,hash]);
  await Promise.all([
   repoA.recordException({id:randomUUID(),runId,exceptionKey:key,severity:"high",state:"open",evidenceHash:hash,detectedAt:now}),
   repoB.recordException({id:randomUUID(),runId,exceptionKey:key,severity:"critical",state:"quarantined",evidenceHash:hash,detectedAt:now})
  ]);
  const row=await setup.query("SELECT count(*)::int AS count,state FROM operational_reconciliation_exceptions WHERE run_id=$1 AND exception_key=$2 GROUP BY state",[runId,key]);
  assert.equal(row.rows.reduce((n,x)=>n+Number(x.count),0),1);
 } finally {
  await setup.query("DELETE FROM operational_reconciliation_exceptions WHERE run_id=$1",[runId]);
  await setup.query("DELETE FROM operational_reconciliation_runs WHERE id=$1",[runId]);
  await Promise.all([setup.end(),a.end(),b.end()]);
 }
});
