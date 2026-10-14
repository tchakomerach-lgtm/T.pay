import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeForExposure,safeClientError,safeSecurityTelemetry,classifyExposure} from "../packages/security/src/fortress-exposure-guard.js";

test("Fortress exposure guard redacts nested secrets and private identity fields",()=>{
 const r=sanitizeForExposure({user:{email:"person@example.com",phone:"+228 90123456",displayName:"A"},auth:{accessToken:"token-value",password:"pw"},note:"Bearer abc.def.ghi"},{channel:"log",purpose:"operational-log",allowedClasses:["internal","confidential","restricted","secret"],maxBytes:4096});
 const value=r.value as any;
 assert.equal(value.user.email,"[REDACTED]");
 assert.equal(value.user.phone,"[REDACTED]");
 assert.equal(value.auth.accessToken,"[REDACTED]");
 assert.equal(value.auth.password,"[REDACTED]");
 assert.ok(!JSON.stringify(value).includes("abc.def.ghi"));
 assert.ok(r.redactedPaths.length>=4);
});

test("Fortress exposure guard refuses oversized or unapproved exports",()=>{
 assert.throws(()=>sanitizeForExposure({record:"x".repeat(500)},{channel:"export",actorId:"actor-1",purpose:"download",allowedClasses:["internal"],maxBytes:100}),/FORTRESS_EXPOSURE_SIZE_LIMIT/);
 assert.throws(()=>sanitizeForExposure({id:"1234567890123456"},{channel:"log",purpose:"logging",allowedClasses:["internal"],maxBytes:1000}),/FORTRESS_EXPOSURE_CLASS_DENIED/);
});

test("Fortress exposure guard rejects export without authenticated actor context",()=>{
 assert.throws(()=>sanitizeForExposure({report:"safe"},{channel:"export",purpose:"download",allowedClasses:["internal"],maxBytes:1000}),/FORTRESS_EXPOSURE_ACTOR_REQUIRED/);
});

test("Client errors never serialize internal exception details",()=>{
 const e=safeClientError("INTERNAL_ERROR","correlation-123");
 assert.deepEqual(e,{error:"REQUEST_FAILED",code:"INTERNAL_ERROR",correlationId:"correlation-123"});
 assert.ok(!JSON.stringify(e).includes("stack"));
});

test("Security telemetry allowlists metadata and reports only redaction counts/digest",()=>{
 const e=safeSecurityTelemetry({eventType:"fortress.exposure.denied",severity:"high",correlationId:"corr-123456",metadata:{apiToken:"dont-log-this",reason:"policy-deny"}});
 assert.equal((e.metadata as any).apiToken,"[REDACTED]");
 assert.ok(!JSON.stringify(e).includes("dont-log-this"));
 assert.equal(typeof e.metadataDigest,"string");
 assert.equal(e.redactedFields,1);
});

test("Exposure classification is conservative for likely payment identifiers",()=>{
 assert.equal(classifyExposure({account:"1234567890123456"}),"restricted");
});
