import {strict as assert} from "node:assert";
import {test} from "node:test";
import {normalizeChannelIngress} from "../packages/api-gateway/src/channel-ingress.js";
import {assertHttpsEndpoint,requestJson} from "../packages/api-gateway/src/https-client.js";

test("L13.4 canonicalizes a mobile ingress without exposing raw scope identifiers",()=>{
  const value=normalizeChannelIngress({
    channel:"mobile",method:"post",route:"/v1/profile",origin:"https://api.tpay.tg",
    correlationId:"corr-123456",idempotencyKey:"idem-123456",scopeSecret:"device-secret-123",
    payload:"{"hello":"world"}",sequenceNo:"42",offline:true
  });
  assert.equal(value.method,"POST");
  assert.equal(value.sequenceNo,"42");
  assert.equal(value.offline,true);
  assert.match(value.scopeHash,/^[a-f0-9]{64}$/);
  assert.match(value.payloadHash,/^[a-f0-9]{64}$/);
  assert.equal(value.payloadBytes,17);
  assert.notEqual(value.scopeHash,"device-secret-123");
});

test("L13.4 rejects non-HTTPS and oversized ingress payloads",()=>{
  assert.throws(()=>normalizeChannelIngress({
    channel:"web",method:"GET",route:"/v1/profile",origin:"http://api.tpay.tg",
    correlationId:"corr-123456",idempotencyKey:"idem-123456",scopeSecret:"device-secret-123",payload:"ok"
  }),/HTTPS/);
  assert.throws(()=>normalizeChannelIngress({
    channel:"web",method:"POST",route:"/v1/profile",origin:"https://api.tpay.tg",
    correlationId:"corr-123456",idempotencyKey:"idem-123456",scopeSecret:"device-secret-123",
    payload:"x".repeat(64*1024+1)
  }),/CHANNEL_PAYLOAD_TOO_LARGE/);
});

test("L13.4 bounds offline sequence numbers",()=>{
  assert.throws(()=>normalizeChannelIngress({
    channel:"agent",method:"POST",route:"/v1/profile",origin:"https://api.tpay.tg",
    correlationId:"corr-123456",idempotencyKey:"idem-123456",scopeSecret:"device-secret-123",
    payload:"ok",sequenceNo:"9223372036854775808"
  }),/CHANNEL_SEQUENCE_INVALID/);
});

test("L13.4 endpoint policy rejects HTTP, private IPs and unapproved hosts",()=>{
  assert.throws(()=>assertHttpsEndpoint("http://provider.example",["provider.example"]),/HTTPS_REQUIRED/);
  assert.throws(()=>assertHttpsEndpoint("https://127.0.0.1",["127.0.0.1"]),/HTTPS_PRIVATE_IP_FORBIDDEN/);
  assert.throws(()=>assertHttpsEndpoint("https://evil.example",["provider.example"]),/HTTPS_HOST_NOT_ALLOWLISTED/);
  assert.throws(()=>assertHttpsEndpoint("https://user:pass@provider.example",["provider.example"]),/HTTPS_CREDENTIALS_IN_URL/);
});

test("L13.4 upstream client uses bounded HTTPS request policy",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true}),{status:200,headers:{"content-type":"application/json","content-length":"11"}});
  try{
    const result=await requestJson<{ok:boolean}>({
      endpoint:"https://provider.example/v1/ping",allowedHosts:["provider.example"],method:"POST",body:{ping:true},timeoutMs:100
    });
    assert.equal(result.status,200);
    assert.equal(result.data.ok,true);
  }finally{globalThis.fetch=original;}
});
