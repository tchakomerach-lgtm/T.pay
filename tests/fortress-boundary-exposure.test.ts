import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeTelemetry,sanitizeTelemetryContext,metricName,emitSafeTelemetry} from "../packages/observability/src/telemetry.js";
import {prepareFortressExport} from "../packages/security/src/fortress-export.js";
import {sanitizeNotificationIntent} from "../packages/events/src/notification.js";
import {SecureHttpsAdapter} from "../packages/integrations/src/secure-http-adapter.js";

test("logs and traces redact nested PII, provider credentials and unsafe identity labels",()=>{
 const safe=sanitizeTelemetry({message:"contact person@example.com at +228 90123456",nested:{apiToken:"ghp_abcdefghijklmnopqrstuvwxyz1234567890",reason:"policy-deny"}});
 const text=JSON.stringify(safe);
 assert.ok(!text.includes("person@example.com"));
 assert.ok(!text.includes("+228 90123456"));
 assert.ok(!text.includes("ghp_abcdefghijklmnopqrstuvwxyz1234567890"));
 assert.equal((safe.nested as Record<string,unknown>).apiToken,"[REDACTED]");
 const context=sanitizeTelemetryContext({serviceName:"tpay-api",traceId:"person@example.com",correlationId:"corr-123456",organizationId:"org_123456",actorId:"+228 90123456"});
 assert.equal(context.traceId,"unavailable");
 assert.equal(context.correlationId,"corr-123456");
 assert.equal(context.actorId,undefined);
 assert.equal(metricName("education","attendance.changed"),"tpay.education.attendance.changed");
 assert.equal(metricName("person@example.com","operation"),"tpay.unknown.unknown");
});

test("Fortress export requires opaque authenticated actor and organization IDs and redacts sensitive values",()=>{
 assert.throws(()=>prepareFortressExport({record:"safe"},{actorId:"person@example.com",organizationId:"org-123",purpose:"report"}),/FORTRESS_EXPORT_AUTH_CONTEXT_INVALID/);
 assert.throws(()=>prepareFortressExport({record:"safe"},{actorId:"actor-123",organizationId:"org-123",purpose:"report for contact details"}),/FORTRESS_EXPORT_PURPOSE_INVALID/);
 const result=prepareFortressExport({contact:"person@example.com",phone:"+228 90123456",apiToken:"secret-value",status:"approved"},{actorId:"actor-123",organizationId:"org-123",purpose:"authorized-report"});
 const payload=result.payload as Record<string,unknown>;
 assert.equal(payload.contact,"[REDACTED_EMAIL]");
 assert.equal(payload.phone,"[REDACTED]");
 assert.equal(payload.apiToken,"[REDACTED]");
 assert.equal(payload.status,"approved");
 assert.equal(result.audit.actorId,"actor-123");
 assert.equal(result.audit.organizationId,"org-123");
 assert.equal(result.audit.classification,"internal");
 assert.ok(!JSON.stringify(result).includes("person@example.com"));
});

test("notification provider receives a scrubbed intent with opaque routing IDs only",()=>{
 const intent={
  id:"44444444-4444-4444-8444-444444444444",
  organizationId:"22222222-2222-4222-8222-222222222222",
  recipientUserId:"11111111-1111-4111-8111-111111111111",
  channel:"in_app" as const,template:"payment_completed",eventId:"33333333-3333-4333-8333-333333333333",
  eventType:"payment.completed" as const,sensitivity:"generic" as const,createdAt:"2026-10-03T22:20:00Z",
  debugMessage:"person@example.com Bearer abc.def.ghi"
 };
 const safe=sanitizeNotificationIntent(intent as never) as typeof intent;
 assert.ok(!safe.debugMessage.includes("person@example.com"));
 assert.ok(!safe.debugMessage.includes("abc.def.ghi"));
 assert.equal(safe.organizationId,intent.organizationId);
});

test("provider adapter bounds response/request sizes and never returns oversized provider data",async()=>{
 const adapter=new SecureHttpsAdapter([{origin:"https://provider.example",pathPrefix:"/api"}],async()=>({status:200,headers:{},body:new Uint8Array(1_000_001)}));
 const result=await adapter.request({url:"https://provider.example/api/pay",method:"POST",headers:{},idempotent:false,correlationId:"person@example.com"});
 await assert.rejects(adapter.request({url:"not-a-url?token=secret",method:"POST",headers:{},idempotent:true,correlationId:"corr-123456"}),/PROVIDER_URL_INVALID/);
 assert.equal(result.state,"UNKNOWN");
 assert.equal(result.body,null);
 assert.equal(result.correlationId,"unavailable");
 await assert.rejects(adapter.request({url:"https://provider.example/api/pay",method:"POST",headers:{},body:new Uint8Array(1_000_001),idempotent:true,correlationId:"corr-123456"}),/PROVIDER_REQUEST_SIZE_LIMIT/);
 await assert.rejects(adapter.request({url:"https://provider.example/api/pay",method:"POST",headers:{"x-test":"safe\r\ninjected"},idempotent:true,correlationId:"corr-123456"}),/PROVIDER_HEADER_NEWLINE_FORBIDDEN/);
});

test("safe telemetry sink never receives unredacted event data",async()=>{
 let emitted:Readonly<Record<string,unknown>>|undefined;
 await emitSafeTelemetry({emit:record=>{emitted=record;}},{event:"login.failure",detail:"contact person@example.com",metadata:{apiToken:"ghp_abcdefghijklmnopqrstuvwxyz1234567890"}});
 const serialized=JSON.stringify(emitted)??"";
 assert.ok(!serialized.includes("person@example.com"));
 assert.ok(!serialized.includes("ghp_abcdefghijklmnopqrstuvwxyz1234567890"));
 assert.ok(emitted);
 assert.equal((emitted.metadata as Record<string,unknown>).apiToken,"[REDACTED]");
});

test("telemetry sink errors do not expose raw provider or transport details",async()=>{
 await assert.rejects(
  emitSafeTelemetry({emit:()=>{throw new Error("Bearer ghp_abcdefghijklmnopqrstuvwxyz1234567890");}},{event:"telemetry.test"}),
  error=>{
   assert.match(String(error),/TELEMETRY_SINK_FAILED/);
   assert.ok(!String(error).includes("ghp_abcdefghijklmnopqrstuvwxyz1234567890"));
   return true;
  }
 );
});
