import test from "node:test";
import assert from "node:assert/strict";
import {ProviderRegistry,certifyProvider,type ProviderRegistration} from "../packages/integrations/src/provider-registry.js";

const base:ProviderRegistration={id:"tmoney",environment:"sandbox",allowedOrigins:["https://sandbox.provider.example"],credential:{secretRef:"kms/providers/tmoney/sandbox"},mtls:"preferred",enabled:true,health:"UNKNOWN",capabilities:["payments"]};

test("P049 rejects insecure endpoints and inline credential patterns",()=>{
 const registry=new ProviderRegistry();
 assert.throws(()=>registry.register({...base,allowedOrigins:["http://sandbox.provider.example"]}),/PROVIDER_HTTPS_REQUIRED/);
 assert.throws(()=>registry.register({...base,credential:{secretRef:"bad ref"}}),/PROVIDER_SECRET_REF_INVALID/);
});
test("P049 production certification requires explicit mTLS policy and HTTPS",async()=>{
 const registry=new ProviderRegistry();registry.register({...base,id:"prod",environment:"production",mtls:"required",allowedOrigins:["https://provider.example"]});
 const result=await certifyProvider(registry,"prod",[{path:"/health",method:"GET",idempotent:true}],async()=>({state:"CONFIRMED",status:200,body:new Uint8Array(),retryable:false,attempts:1,correlationId:"c"}));
 assert.equal(result.passed,true);assert.ok(result.checks.every(c=>c.passed));
});
test("P049 provider probe never treats UNKNOWN as success",async()=>{
 const registry=new ProviderRegistry();registry.register(base);
 const result=await certifyProvider(registry,"tmoney",[{path:"/health",method:"GET",idempotent:true}],async()=>({state:"UNKNOWN",status:null,body:null,retryable:true,attempts:3,correlationId:"c"}));
 assert.equal(result.passed,false);
});
test("P049 blocked provider cannot be silently re-enabled",()=>{
 const registry=new ProviderRegistry();registry.register(base);registry.block("tmoney");
 assert.throws(()=>registry.enable("tmoney"),/PROVIDER_BLOCKED_REQUIRES_REVIEW/);
});
