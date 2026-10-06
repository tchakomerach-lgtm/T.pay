import test from "node:test";
import assert from "node:assert/strict";
import { encodeCursor, decodeCursor } from "../packages/platform/src/pagination.js";
import { evaluateRuntimeMode, resolveRuntimeMode } from "../packages/platform/src/runtime-mode.js";
import { MetricsRegistry } from "../packages/observability/src/metrics.js";

const secret="01234567890123456789012345678901";

test("signed pagination cursor rejects tampering and scope changes",()=>{
  const cursor=encodeCursor({createdAt:"2026-10-06T09:00:00.000Z",id:"00000000-0000-0000-0000-000000000001",scope:"org:user-1"},secret);
  assert.deepEqual(decodeCursor(cursor,secret,"org:user-1").id,"00000000-0000-0000-0000-000000000001");
  assert.throws(()=>decodeCursor(cursor,secret,"org:user-2"),/INVALID_CURSOR/);
  const parts=cursor.split(".");
  assert.ok(parts[0] && parts[1]);
  const body=Buffer.from(parts[0],"base64url");
  const index=body.length-1;
  assert.ok(index>=0);
  const last=body[index];
  assert.notEqual(last,undefined);
  body[index]=last^1;
  assert.throws(()=>decodeCursor(body.toString("base64url")+"."+parts[1],secret,"org:user-1"),/INVALID_CURSOR/);
});

test("runtime modes fail closed for writes",()=>{
  assert.equal(resolveRuntimeMode("maintenance"),"maintenance");
  assert.equal(evaluateRuntimeMode("maintenance","POST","/v1/payments/intents").allowed,false);
  assert.equal(evaluateRuntimeMode("maintenance","GET","/v1/health").allowed,true);
  assert.equal(evaluateRuntimeMode("readonly","GET","/v1/profile").allowed,true);
  assert.equal(evaluateRuntimeMode("readonly","POST","/v1/profile").allowed,false);
});

test("metrics registry stays bounded and emits prometheus",()=>{
  const metrics=new MetricsRegistry();
  metrics.inc("tpay_http_requests_total",{route:"/v1/health",method:"GET",status:"200"});
  metrics.observe("tpay_http_request_duration_seconds",0.12,{route:"/v1/health",method:"GET"});
  const output=metrics.toPrometheus();
  assert.match(output,/tpay_http_requests_total/);
  assert.match(output,/tpay_http_request_duration_seconds_bucket/);
});
