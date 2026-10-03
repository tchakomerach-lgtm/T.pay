import test from "node:test";
import assert from "node:assert/strict";
import {assertSessionActive,assertSessionOrganization} from "../packages/security/src/session.js";
import {defaultRiskPolicy} from "../packages/security/src/risk.js";
import {sanitizeTelemetry} from "../packages/observability/src/telemetry.js";

const session={sessionId:"s",userId:"u",organizationId:"org-a",createdAt:0,expiresAt:1000,assurance:"standard" as const};

test("expired organization session is rejected",()=>assert.throws(()=>assertSessionActive(session,1000),/SESSION_EXPIRED/));
test("cross-organization session is rejected",()=>assert.throws(()=>assertSessionOrganization(session,"org-b"),/ORGANIZATION_SESSION_MISMATCH/));
test("high impact operations require step-up and human approval",()=>{
 const p=defaultRiskPolicy("payment.withdraw"); assert.equal(p.requiresStepUp,true); assert.equal(p.requiresHumanApproval,true);
});
test("telemetry redacts sensitive fields",()=>{
 const x=sanitizeTelemetry({userId:"u",password:"secret",authorization:"bearer x",amount:1000}); assert.equal(x.password,"[REDACTED]"); assert.equal(x.authorization,"[REDACTED]"); assert.equal(x.amount,1000);
});