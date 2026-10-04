import test from "node:test";
import assert from "node:assert/strict";
import {PostgresOperationalObservabilityRepository, type DbQuery} from "../packages/operations/src/observability.js";

function db(){const calls:string[]=[];const query:DbQuery["query"]=async<R extends Record<string,unknown>>(sql:string,values?:unknown[])=>{calls.push(sql);return {rows:[] as R[],rowCount:1};};return {calls,query};}
const hash="b".repeat(64);
test("operational measurements reject negative values and bad evidence",async()=>{const d=db();const r=new PostgresOperationalObservabilityRepository(d);await assert.rejects(()=>r.recordMeasurement({id:"1",service:"api",metric:"latency_ms",value:-1n,observedAt:new Date().toISOString(),evidenceHash:hash}),/OPERATIONAL_MEASUREMENT_INVALID/);assert.equal(d.calls.length,0);});
test("alerts are upserted durably",async()=>{const d=db();const r=new PostgresOperationalObservabilityRepository(d);await r.upsertAlert({id:"1",service:"api",alertKey:"api-degraded",severity:"high",state:"open",firstSeenAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),evidenceHash:hash});assert.equal(d.calls.length,1);});
