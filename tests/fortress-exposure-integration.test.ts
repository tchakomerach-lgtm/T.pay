import test from "node:test";
import assert from "node:assert/strict";
import {SecurityMonitor} from "../packages/security/src/security-monitor.js";
import {enforceOutputBoundary} from "../packages/security/src/data-boundary.js";

test("SecurityMonitor scrubs free-text PII and tokens before memory and audit hashing",()=>{
 const monitor=new SecurityMonitor();
 monitor.record({eventType:"fortress.exposure.denied",organizationId:"org-123",actorId:"actor-123",correlationId:"corr-123456",severity:"high",timestamp:Date.now(),metadata:{message:"Contact person@example.com at +228 90123456",credential:"ghp_abcdefghijklmnopqrstuvwxyz1234567890",reason:"policy-deny"}});
 const event=monitor.snapshot()[0];
 const serialized=JSON.stringify(event);
 assert.ok(!serialized.includes("person@example.com"));
 assert.ok(!serialized.includes("+228 90123456"));
 assert.ok(!serialized.includes("ghp_abcdefghijklmnopqrstuvwxyz1234567890"));
 assert.equal((event.metadata as any).credential,"[REDACTED]");
 assert.doesNotThrow(()=>monitor.verifyAuditIntegrity());
});

test("AI output boundary scrubs identifiers embedded in prose",()=>{
 const result=enforceOutputBoundary({answer:"Email person@example.com or call +228 90123456",apiKey:"should-not-escape"},{allowed:["internal"],maxBytes:4096});
 const serialized=JSON.stringify(result);
 assert.ok(!serialized.includes("person@example.com"));
 assert.ok(!serialized.includes("+228 90123456"));
 assert.ok(!serialized.includes("should-not-escape"));
});

test("SecurityMonitor rejects malformed tenant identifiers instead of logging them",()=>{
 const monitor=new SecurityMonitor();
 assert.throws(()=>monitor.record({eventType:"security.event",organizationId:"org@example.com",severity:"warn",timestamp:Date.now(),metadata:{ok:true}}),/SECURITY_EVENT_TENANT_ID_INVALID/);
});
