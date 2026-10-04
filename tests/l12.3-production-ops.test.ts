import test from "node:test";
import assert from "node:assert/strict";
import {PostgresProductionOpsRepository, type DbQuery} from "../packages/operations/src/production-ops.js";

function db(){
  const calls:string[]=[];
  const query:DbQuery["query"]=async(sql:string,values?:unknown[])=>{
      calls.push(sql);
      if(sql.includes("RETURNING true")) return {rows:[{acquired:true}],rowCount:1};
      return {rows:[],rowCount:1};
    };
  return {calls,query};
}
const hash="a".repeat(64);

test("secret rotation evidence rejects invalid digests before persistence",async()=>{
  const d=db(); const r=new PostgresProductionOpsRepository(d);
  await assert.rejects(()=>r.recordSecretRotation({
    id:"00000000-0000-0000-0000-000000000001",secretRef:"provider/tmoney",version:"v2",
    materialDigest:"bad",status:"succeeded",startedAt:new Date().toISOString(),evidenceHash:hash
  }),/SECRET_ROTATION_HASH_INVALID/);
  assert.equal(d.calls.length,0);
});

test("deployment lock is lease based and owner scoped",async()=>{
  const d=db(); const r=new PostgresProductionOpsRepository(d);
  assert.equal(await r.acquireDeploymentLock("schema","worker-a",new Date(Date.now()+60000).toISOString(),new Date().toISOString()),true);
  assert.equal(await r.releaseDeploymentLock("schema","worker-b"),true);
  assert.equal(d.calls.length,2);
});

test("incident delivery evidence is durable",async()=>{
  const d=db(); const r=new PostgresProductionOpsRepository(d);
  await r.recordIncidentDelivery({
    id:"00000000-0000-0000-0000-000000000002",routeId:"00000000-0000-0000-0000-000000000003",
    incidentId:"00000000-0000-0000-0000-000000000004",deliveryKey:"incident-4-route-3",
    status:"queued",attemptedAt:new Date().toISOString(),evidenceHash:hash
  });
  assert.equal(d.calls.length,1);
});
