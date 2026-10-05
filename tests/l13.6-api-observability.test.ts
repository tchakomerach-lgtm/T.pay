import {strict as assert} from "node:assert";
import {test} from "node:test";
import {ApiObservabilityRepository} from "../packages/api-gateway/src/api-observability.js";

test("L13.6 records privacy-minimized runtime evidence",async()=>{
  let values:unknown[]|undefined;
  const db={query:async(sql:string,input?:unknown[])=>{
    values=input;
    return {rows:[{id:"event-1"}],rowCount:1};
  }};
  const repo=new ApiObservabilityRepository(db);
  await repo.record({
    correlationId:"corr-123456",route:"/v1/profile",method:"get",apiVersion:"v1",channel:"mobile",
    statusCode:200,outcome:"success",durationMs:12,occurredAt:"2026-10-05T10:00:00.000Z",
    evidence:"secret-and-pii-must-not-be-stored"
  });
  assert.equal(values?.[3],"/v1/profile");
  assert.equal(values?.[4],"GET");
  assert.equal(values?.[7],200);
  assert.match(String(values?.[12]),/^[a-f0-9]{64}$/);
  assert.notEqual(values?.[12],"secret-and-pii-must-not-be-stored");
});

test("L13.6 rejects invalid telemetry bounds",async()=>{
  const repo=new ApiObservabilityRepository({query:async()=>({rows:[],rowCount:0})});
  await assert.rejects(()=>repo.record({
    correlationId:"corr-123456",route:"/v1/profile",method:"GET",apiVersion:"v1",channel:"web",
    statusCode:200,outcome:"success",durationMs:300001,occurredAt:"2026-10-05T10:00:00.000Z"
  }),/OBS_DURATION_INVALID/);
});

test("L13.6 retention deletion is operational-only",async()=>{
  let called=false;
  const repo=new ApiObservabilityRepository({query:async(sql)=>{called=sql.startsWith("DELETE FROM api_runtime_events");return {rows:[{id:"a"},{id:"b"}],rowCount:2};}});
  const count=await repo.pruneBefore("2026-01-01T00:00:00.000Z");
  assert.equal(count,2);
  assert.equal(called,true);
});
