import {strict as assert} from "node:assert";
import {test} from "node:test";
import {ApiRuntimeGate} from "../packages/api-gateway/src/runtime-gate.js";
import {ApiAbuseRepository} from "../packages/api-gateway/src/rate-abuse.js";

function gate(){
 const abuse=new ApiAbuseRepository({query:async()=>({rows:[{request_count:"1",max_requests:"60",window_started_at:"2026-10-05T10:01:00.000Z",window_seconds:60}],rowCount:1})});
 return new ApiRuntimeGate(abuse);
}

test("L14.1 financial routes require explicit intent evidence",async()=>{
 const result=await gate().evaluate({
  method:"POST",route:"/v1/payments/intents",authClass:"member",channel:"mobile",
  origin:"https://tpay.example",correlationId:"corr-fin-1",
  scopeSecrets:{channel:"channel",ip:"ip",actor:"actor",organization:"org"},
  organizationId:"org-1",now:"2026-10-05T10:01:12.000Z"
 });
 assert.equal(result.allowed,false);
 assert.equal(result.status,400);
 assert.equal(result.code,"FINANCIAL_INTENT_IDEMPOTENCY_REQUIRED");
});

test("L14.1 valid financial intent passes gateway admission but remains governed",async()=>{
 const result=await gate().evaluate({
  method:"POST",route:"/v1/payments/intents",authClass:"member",channel:"mobile",
  origin:"https://tpay.example",correlationId:"corr-fin-2",
  scopeSecrets:{channel:"channel",ip:"ip",actor:"actor",organization:"org"},
  organizationId:"org-1",idempotencyKey:"idem-12345678",payloadHash:"a".repeat(64),
  now:"2026-10-05T10:01:12.000Z"
 });
 assert.equal(result.allowed,true);
 if(result.allowed)assert.equal(result.policyKey,"mobile:member");
});

test("L14.1 direct ledger route remains denied by default",async()=>{
 const result=await gate().evaluate({
  method:"POST",route:"/v1/ledger",authClass:"member",channel:"mobile",
  origin:"https://tpay.example",correlationId:"corr-fin-3",
  scopeSecrets:{channel:"channel",ip:"ip",actor:"actor"},organizationId:"org-1",
  idempotencyKey:"idem-12345678",payloadHash:"a".repeat(64),
  now:"2026-10-05T10:01:12.000Z"
 });
 assert.equal(result.allowed,false);
 assert.equal(result.code,"FINANCIAL_CORE_DENY_BY_DEFAULT");
});
