import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { CircuitBreaker, SecureHttpsAdapter, verifySignedWebhook, type HttpsResponse, type WebhookReplayStore } from "../packages/integrations/src/secure-http-adapter.js";

test("P043 HTTPS adapter rejects non-HTTPS and non-allowlisted endpoints", async ()=>{
  const adapter=new SecureHttpsAdapter([{origin:"https://provider.example",pathPrefix:"/api/v1"}],async()=>({status:200,headers:{},body:new Uint8Array()}));
  await assert.rejects(adapter.request({url:"http://provider.example/api/v1/pay",method:"POST",headers:{},idempotent:true,correlationId:"c1"}),/HTTPS_REQUIRED/);
  await assert.rejects(adapter.request({url:"https://evil.example/api/v1/pay",method:"POST",headers:{},idempotent:true,correlationId:"c2"}),/ENDPOINT_NOT_ALLOWLISTED/);
});

test("P043 adapter retries only idempotent transient failures and returns UNKNOWN after exhaustion", async ()=>{
  let calls=0; const waits:number[]=[];
  const transport=async():Promise<HttpsResponse>=>{calls++;return {status:503,headers:{},body:new Uint8Array()};};
  const adapter=new SecureHttpsAdapter([{origin:"https://provider.example",pathPrefix:"/api"}],transport,new CircuitBreaker(10,30000),1000,3,async ms=>{waits.push(ms)},()=>0);
  const result=await adapter.request({url:"https://provider.example/api/pay",method:"POST",headers:{"x-idempotency-key":"idem-123456"},idempotent:true,correlationId:"c3"});
  assert.equal(result.state,"UNKNOWN"); assert.equal(result.attempts,3); assert.equal(calls,3); assert.equal(waits.length,2);
});

test("P043 circuit breaker fails closed after threshold and allows half-open probe",()=>{
  let now=1000; const breaker=new CircuitBreaker(2,1000,()=>now);
  assert.equal(breaker.allow(),true); breaker.failure(); breaker.failure(); assert.equal(breaker.allow(),false);
  now=2000; assert.equal(breaker.allow(),true); breaker.failure(); assert.equal(breaker.allow(),false);
  now=3000; assert.equal(breaker.allow(),true); breaker.success(); assert.equal(breaker.allow(),true);
});

test("P043 signed webhook requires timestamp, nonce, constant-time signature and replay protection",async()=>{
  const secret=randomBytes(32); const body=new TextEncoder().encode('{"event":"payment.confirmed"}'); const nonce="nonce-"+randomBytes(8).toString("hex"); const timestamp=1_800_000_000;
  const signature=createHmac("sha256",secret).update(String(timestamp)).update(".").update(nonce).update(".").update(Buffer.from(body)).digest("hex");
  const seen=new Set<string>();
  const replayStore:WebhookReplayStore={has:async n=>seen.has(n),remember:async(n)=>{seen.add(n)}};
  await verifySignedWebhook({rawBody:body,signature:`t=${timestamp},v1=${signature}`,nonce,secret,nowMs:timestamp*1000,replayStore});
  await assert.rejects(verifySignedWebhook({rawBody:body,signature:`t=${timestamp},v1=${signature}`,nonce,secret,nowMs:timestamp*1000,replayStore}),/WEBHOOK_REPLAY_DETECTED/);
  await assert.rejects(verifySignedWebhook({rawBody:body,signature:`t=${timestamp-1000},v1=${signature}`,nonce:"new-nonce",secret,nowMs:timestamp*1000,replayStore,maxAgeMs:100}),/WEBHOOK_TIMESTAMP_EXPIRED/);
});
