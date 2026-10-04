import test from "node:test";
import assert from "node:assert/strict";
import {PostgresAiObservabilityRepository} from "../packages/ai-core/src/observability.js";
test("L11.5 records token/cost telemetry without prompt content",async()=>{
  const calls:any[]=[];
  const db={query:async(sql:string,args:unknown[])=>{calls.push({sql,args});return {rowCount:1,rows:[]}}};
  const repo=new PostgresAiObservabilityRepository(db as any);
  await repo.record({id:"o1",organizationId:"org1",requestId:"req1",provider:"openai",model:"gpt",status:"succeeded",latencyMs:42,attempts:2,inputTokens:100,outputTokens:30,estimatedCostMinor:7n,createdAt:"2026-10-04T14:00:00Z"});
  assert.equal(calls.length,1);
  assert.equal(calls[0].args.includes("prompt"),false);
  assert.equal(calls[0].args.includes("userPrompt"),false);
});
test("L11.5 rejects negative telemetry",async()=>{
  const repo=new PostgresAiObservabilityRepository({query:async()=>({rowCount:1,rows:[]})} as any);
  await assert.rejects(()=>repo.record({id:"o1",requestId:"r",provider:"local",model:"safe",status:"failed",latencyMs:-1,attempts:0,inputTokens:0,outputTokens:0,estimatedCostMinor:0n,createdAt:"2026-10-04T14:00:00Z"}),/AI_OBSERVATION_INVALID/);
});
