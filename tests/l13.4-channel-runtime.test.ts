import {strict as assert} from "node:assert";
import {test} from "node:test";
import {ApiRuntimeGate} from "../packages/api-gateway/src/runtime-gate.js";
import {ApiAbuseRepository} from "../packages/api-gateway/src/rate-abuse.js";
import {ChannelIngressRepository} from "../packages/api-gateway/src/channel-repository.js";
import {processChannelIngress} from "../packages/api-gateway/src/channel-runtime.js";

test("L13.4 routes a governed mobile request into evidence without financial mutation",async()=>{
  const runtime={
    evaluate:async()=>({allowed:true,correlationId:"corr-runtime-1",policyKey:"mobile:POST:/v1/profile",rateScopes:["channel","ip","actor"]})
  } as unknown as ApiRuntimeGate;
  let persisted=false;
  const repository=new ChannelIngressRepository({query:async(sql:string)=>{if(sql.includes("INSERT INTO api_channel_ingress_events")){persisted=true;return {rows:[{id:"evidence-1"}],rowCount:1};}throw new Error("UNEXPECTED_QUERY");}});
  const result=await processChannelIngress({
    channel:"mobile",method:"POST",route:"/v1/profile",origin:"https://api.tpay.tg",
    correlationId:"corr-runtime-1",idempotencyKey:"idem-runtime-1",scopeSecret:"scope-runtime-1",
    payload:"{}",authClass:"user",scopeSecrets:{channel:"c",ip:"i",actor:"a"},now:"2026-10-05T10:01:12.000Z"
  },runtime,repository);
  assert.equal(result.runtime.allowed,true);
  assert.equal(result.evidence?.state,"accepted");
  assert.equal(persisted,true);
});

test("L13.4 refuses financial routes before channel evidence is recorded",async()=>{
  const abuse=new ApiAbuseRepository({query:async()=>({rows:[],rowCount:0})});
  const runtime=new ApiRuntimeGate(abuse);
  let persisted=false;
  const repository=new ChannelIngressRepository({query:async()=>{persisted=true;return {rows:[],rowCount:0};}});
  const result=await processChannelIngress({
    channel:"mobile",method:"POST",route:"/v1/payments",origin:"https://api.tpay.tg",
    correlationId:"corr-runtime-2",idempotencyKey:"idem-runtime-2",scopeSecret:"scope-runtime-2",
    payload:"{}",authClass:"user",scopeSecrets:{channel:"c",ip:"i",actor:"a"},now:"2026-10-05T10:01:12.000Z"
  },runtime,repository);
  assert.equal(result.runtime.allowed,false);
  assert.equal(result.runtime.code,"FINANCIAL_CORE_DENY_BY_DEFAULT");
  assert.equal(persisted,false);
});
