import test from "node:test";
import assert from "node:assert/strict";
import {PostgresOperationalRecoveryRepository,type OperationalDb} from "../packages/operations/src/operational-recovery.js";
const hash="d".repeat(64);
function db(){const calls:string[]=[];const query:OperationalDb["query"]=async(sql,values)=>{calls.push(sql);return {rows:sql.includes("RETURNING")?[{id:"job-1"}]:[],rowCount:1};};return {calls,query};}
test("L12.5 rejects invalid reconciliation evidence",async()=>{const d=db();const r=new PostgresOperationalRecoveryRepository(d);await assert.rejects(()=>r.enqueueReconciliation({id:"j",organizationId:"o",idempotencyKey:"k",scopeType:"provider",scopeRef:"tmoney",status:"queued",attemptCount:-1n,nextAttemptAt:new Date().toISOString(),evidenceHash:hash,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}),/RECONCILIATION_JOB_INVALID/);assert.equal(d.calls.length,0);});
test("L12.5 claims and transitions reconciliation jobs",async()=>{const d=db();const r=new PostgresOperationalRecoveryRepository(d);assert.equal(await r.claimDue("org","worker",new Date().toISOString()),"job-1");assert.equal(await r.transition("job-1","running","quarantined",new Date().toISOString(),"PROVIDER_AMBIGUOUS"),true);});
test("L12.5 rejects invalid DR evidence",async()=>{const d=db();const r=new PostgresOperationalRecoveryRepository(d);await assert.rejects(()=>r.setDrState({service:"ledger",state:"degraded",epoch:-1n,changedAt:new Date().toISOString(),evidenceHash:hash}),/DR_STATE_INVALID/);});
